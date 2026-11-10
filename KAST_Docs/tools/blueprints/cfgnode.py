"""Minimal KSP ConfigNode parser (craft files, part cfgs, ModuleManager.ConfigCache)."""
import re

class Node:
    __slots__ = ('name', 'values', 'nodes')
    def __init__(self, name=''):
        self.name, self.values, self.nodes = name, [], []
    def get(self, key, default=None):
        for k, v in self.values:
            if k == key:
                return v
        return default
    def getall(self, key):
        return [v for k, v in self.values if k == key]
    def node(self, name):
        for n in self.nodes:
            if n.name == name:
                return n
        return None
    def nodesnamed(self, name):
        return [n for n in self.nodes if n.name == name]
    def __repr__(self):
        return f'<Node {self.name} {len(self.values)}v {len(self.nodes)}n>'

def parse(text):
    root = Node('root')
    stack = [root]
    pending = None          # a bare word that may be a node name
    for raw in text.splitlines():
        line = raw.split('//', 1)[0].strip()
        while line:
            if line.startswith('{'):
                n = Node(pending or '')
                stack[-1].nodes.append(n); stack.append(n); pending = None
                line = line[1:].strip(); continue
            if line.startswith('}'):
                if pending is not None:
                    pending = None
                if len(stack) > 1:
                    stack.pop()
                line = line[1:].strip(); continue
            # next token up to a brace
            m = re.match(r'([^{}]*)(.*)', line)
            tok, rest = m.group(1).strip(), m.group(2)
            if '=' in tok:
                k, v = tok.split('=', 1)
                stack[-1].values.append((k.strip(), v.strip()))
                pending = None
            elif tok:
                pending = tok
            line = rest.strip()
    return root

def vec(s, n=None):
    parts = [float(x) for x in re.split(r'[,\s]+', s.strip()) if x]
    return parts if n is None else (parts + [0.0] * n)[:n]
