"""KAST reader for KSP .mu models (PartTools binary format).

Reads only what a blueprint needs: the transform tree and rendered meshes (MeshFilter + MeshRenderer,
SkinnedMeshRenderer). Colliders, animations, lights, cameras and particles are skipped byte-exactly.
Reading stops at the materials block, which PartTools writes after the whole transform tree.
Coordinates stay in Unity's left-handed space.
"""
import struct
import numpy as np

MU_MAGIC = 76543

# entry types
CHILD_START, CHILD_END, ANIMATION = 0, 1, 2
MESH_COLLIDER, SPHERE_COLLIDER, CAPSULE_COLLIDER, BOX_COLLIDER = 3, 4, 5, 6
MESH_FILTER, MESH_RENDERER, SKINNED_RENDERER = 7, 8, 9
MATERIALS, MATERIAL, TEXTURES = 10, 11, 12
MESH_START, MESH_VERTS, MESH_UV, MESH_UV2, MESH_NORMALS, MESH_TANGENTS, MESH_TRIS = 13, 14, 15, 16, 17, 18, 19
MESH_BONE_WEIGHTS, MESH_BIND_POSES, MESH_END = 20, 21, 22
LIGHT, TAG_AND_LAYER = 23, 24
MESH_COLLIDER2, SPHERE_COLLIDER2, CAPSULE_COLLIDER2, BOX_COLLIDER2, WHEEL_COLLIDER = 25, 26, 27, 28, 29
CAMERA, PARTICLES, MESH_VERTEX_COLORS = 30, 31, 32


class StopReading(Exception):
    pass


class Transform:
    __slots__ = ('name', 'pos', 'rot', 'scale', 'children', 'mesh', 'rendered', 'skinned', 'layer', 'parent', 'bones', 'anims')

    def __init__(self):
        self.children, self.mesh, self.rendered, self.skinned, self.layer, self.parent = [], None, False, False, 0, None
        self.bones = []
        self.anims = []


class Mesh:
    __slots__ = ('verts', 'tris', 'bw_raw', 'bindposes', 'normals')

    def __init__(self):
        self.normals = None
        self.bw_raw = None
        self.bindposes = None


class MuReader:
    def __init__(self, data):
        self.d, self.o = data, 0
        self.version = 0

    # --- primitives ---
    def take(self, n):
        if self.o + n > len(self.d):
            raise EOFError
        b = self.d[self.o:self.o + n]
        self.o += n
        return b

    def i32(self):
        return struct.unpack_from('<i', self.take(4))[0]

    def u8(self):
        return self.take(1)[0]

    def f32(self, n=1):
        v = struct.unpack_from('<%df' % n, self.take(4 * n))
        return v[0] if n == 1 else v

    def skip(self, n):
        self.take(n)

    def string(self):
        # .NET BinaryWriter string: 7-bit encoded length, then UTF-8 bytes
        n, shift = 0, 0
        while True:
            b = self.u8()
            n |= (b & 0x7F) << shift
            shift += 7
            if not b & 0x80:
                break
        return self.take(n).decode('utf-8', 'replace')

    # --- file ---
    def read(self):
        magic, self.version = self.i32(), self.i32()
        if magic != MU_MAGIC:
            raise ValueError('not a .mu file')
        self.name = self.string()
        root = Transform()
        try:
            self.read_object(root)
        except (StopReading, EOFError):
            pass
        return root

    def read_object(self, t):
        t.name = self.string()
        t.pos = self.f32(3)
        t.rot = self.f32(4)          # x, y, z, w
        t.scale = self.f32(3)
        while True:
            try:
                et = self.i32()
            except EOFError:
                return
            if et == CHILD_START:
                c = Transform()
                c.parent = t
                t.children.append(c)
                self.read_object(c)
            elif et == CHILD_END:
                return
            elif et == TAG_AND_LAYER:
                self.string()
                t.layer = self.i32()
            elif et == MESH_FILTER:
                t.mesh = self.read_mesh()
            elif et == MESH_RENDERER:
                if self.version > 0:
                    self.skip(2)                     # cast / receive shadows
                n = self.i32()
                self.skip(4 * n)                     # material indices
                t.rendered = True
            elif et == SKINNED_RENDERER:
                n = self.i32()
                self.skip(4 * n)                     # materials
                self.skip(12 + 12 + 4 + 1)           # bounds centre, size, quality, updateWhenOffscreen
                nb = self.i32()
                t.bones = [self.string() for _ in range(nb)]
                t.mesh = self.read_mesh()
                t.rendered = True
                t.skinned = True
            elif et in (MESH_COLLIDER, MESH_COLLIDER2):
                if et == MESH_COLLIDER2:
                    self.skip(1)                     # isTrigger
                self.skip(1)                         # convex
                self.read_mesh()                     # collider mesh, discarded
            elif et in (SPHERE_COLLIDER, SPHERE_COLLIDER2):
                self.skip((1 if et == SPHERE_COLLIDER2 else 0) + 4 + 12)
            elif et in (CAPSULE_COLLIDER, CAPSULE_COLLIDER2):
                self.skip((1 if et == CAPSULE_COLLIDER2 else 0) + 4 + 4 + 4 + 12)
            elif et in (BOX_COLLIDER, BOX_COLLIDER2):
                self.skip((1 if et == BOX_COLLIDER2 else 0) + 12 + 12)
            elif et == WHEEL_COLLIDER:
                self.skip(4 + 4 + 4 + 12)            # mass, radius, suspension, centre
                self.skip(3 * 4)                     # spring: spring, damper, target
                self.skip(2 * 5 * 4)                 # forward and sideways friction curves
                self.skip(1)                         # enabled
            elif et == ANIMATION:
                t.anims = self.read_animation()
            elif et == CAMERA:
                self.skip(4 + 16 + 4 + 1 + 4 + 4 + 4 + 4)
            elif et == LIGHT:
                self.skip(4 + 4 + 4 + 16 + 4 + (4 if self.version > 1 else 0))
            elif et == PARTICLES:
                self.skip_particles()
            elif et in (MATERIALS, TEXTURES):
                raise StopReading
            else:
                raise ValueError('unknown entry type %d at offset %d' % (et, self.o - 4))

    def read_mesh(self):
        if self.i32() != MESH_START:
            raise ValueError('mesh start missing')
        nv, nsub = self.i32(), self.i32()
        m = Mesh()
        m.verts = np.zeros((0, 3), np.float32)
        tris = []
        while True:
            et = self.i32()
            if et == MESH_END:
                break
            if et == MESH_VERTS:
                m.verts = np.frombuffer(self.take(12 * nv), '<f4').reshape(nv, 3).copy()
            elif et in (MESH_UV, MESH_UV2):
                self.skip(8 * nv)
            elif et == MESH_NORMALS:
                m.normals = np.frombuffer(self.take(12 * nv), '<f4').reshape(nv, 3).copy()
            elif et == MESH_TANGENTS:
                self.skip(16 * nv)
            elif et == MESH_BONE_WEIGHTS:
                bw = np.frombuffer(self.take(32 * nv), np.uint8).reshape(nv, 32)
                m.bw_raw = bw.copy()
            elif et == MESH_BIND_POSES:
                nbp = self.i32()
                m.bindposes = np.frombuffer(self.take(64 * nbp), '<f4').reshape(nbp, 4, 4).copy()
            elif et == MESH_TRIS:
                n = self.i32()
                tris.append(np.frombuffer(self.take(4 * n), '<i4').reshape(-1, 3))
            elif et == MESH_VERTEX_COLORS:
                self.skip(4 * nv)
            else:
                raise ValueError('unknown mesh entry %d' % et)
        m.tris = np.concatenate(tris) if tris else np.zeros((0, 3), np.int32)
        return m

    def read_animation(self):
        """[(clip name, [(path, property, [(time, value), ...]), ...])]"""
        clips = []
        nclips = self.i32()
        for _ in range(nclips):
            name = self.string()
            self.skip(12 + 12 + 4)
            curves = []
            for _ in range(self.i32()):
                path, prop = self.string(), self.string()
                ctype = self.i32()
                wrap = (self.i32(), self.i32())
                nkeys = wrap[1] if ctype == 8 else self.i32()
                k = np.frombuffer(self.take(nkeys * 20), '<f4').reshape(nkeys, 5) if nkeys else np.zeros((0, 5), np.float32)
                curves.append((path, prop, k[:, :2].copy()))
            clips.append((name, curves))
        self.string()
        self.skip(1)
        return clips

    def skip_animation(self):
        nclips = self.i32()
        for _ in range(nclips):
            self.string()                            # clip name
            self.skip(12 + 12 + 4)                   # local bounds centre, size, wrap mode
            ncurves = self.i32()
            for _ in range(ncurves):
                self.string(); self.string()         # path, property
                ctype = self.i32()
                wrap = (self.i32(), self.i32())
                if ctype == 8:                       # old PartTools export without the type: wrap ate the count
                    nkeys = wrap[1]
                else:
                    nkeys = self.i32()
                self.skip(nkeys * 20)                # time, value, in/out tangent, tangent mode
        self.string()                                # default clip
        self.skip(1)                                 # autoplay

    def skip_particles(self):
        self.skip(1 + 4 + 12 + 8 + 4 + 16 + 1 + 8 + 8 + 8 + 12 + 12 + 12 + 4 + 4 + 4 + 1 + 1)
        self.skip(5 * 16)                            # colour animation
        self.skip(12 + 12 + 4 + 12 + 12 + 4 + 1 + 1 + 4 + 4 + 4 + 4 + 12 + 4)


def read_mu(path):
    with open(path, 'rb') as f:
        return MuReader(f.read()).read()
