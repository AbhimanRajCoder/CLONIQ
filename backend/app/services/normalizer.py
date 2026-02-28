"""
normalizer.py
─────────────
Walks a parsed AST and applies transformations so that
structurally-identical code always produces the same tree:

1. Variable identifiers   → var_1, var_2, …
2. Function names          → func_1, func_2, …
3. Constant literals       → the string "CONST"
4. Docstrings              → removed entirely
5. Line numbers (lineno / end_lineno) are PRESERVED.

Comments and formatting are already absent after `ast.parse`.
"""

import ast
from copy import deepcopy
from typing import Dict


class _NameCanonicalizer(ast.NodeTransformer):
    """Single-pass transformer that rewrites identifiers, constants, and strips docstrings."""

    def __init__(self) -> None:
        super().__init__()
        self._var_map: Dict[str, str] = {}
        self._func_map: Dict[str, str] = {}
        self._var_counter: int = 0
        self._func_counter: int = 0

    # ── helpers ──────────────────────────────────────────────

    def _canonical_var(self, original: str) -> str:
        """Return a stable canonical name for a variable identifier."""
        if original not in self._var_map:
            self._var_counter += 1
            self._var_map[original] = f"var_{self._var_counter}"
        return self._var_map[original]

    def _canonical_func(self, original: str) -> str:
        """Return a stable canonical name for a function identifier."""
        if original not in self._func_map:
            self._func_counter += 1
            self._func_map[original] = f"func_{self._func_counter}"
        return self._func_map[original]

    @staticmethod
    def _is_docstring(node: ast.AST, parent_body: list) -> bool:
        """Check if a node is a docstring (first Expr with a Constant str in a body)."""
        if not parent_body:
            return False
        first = parent_body[0]
        return (
            first is node
            and isinstance(node, ast.Expr)
            and isinstance(node.value, ast.Constant)
            and isinstance(node.value.value, str)
        )

    # ── docstring removal ────────────────────────────────────

    def _strip_docstrings(self, body: list) -> list:
        """Remove leading docstring from a body list if present."""
        if (
            body
            and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)
        ):
            return body[1:]
        return body

    # ── visitor methods ──────────────────────────────────────

    def visit_Module(self, node: ast.Module) -> ast.Module:
        """Strip module-level docstrings."""
        node.body = self._strip_docstrings(node.body)
        self.generic_visit(node)
        return node

    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.FunctionDef:
        """Rename function, normalize args, strip docstrings."""
        node.name = self._canonical_func(node.name)
        for arg in node.args.args:
            arg.arg = self._canonical_var(arg.arg)
        node.body = self._strip_docstrings(node.body)
        self.generic_visit(node)
        return node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> ast.AsyncFunctionDef:
        """Rename async function, normalize args, strip docstrings."""
        node.name = self._canonical_func(node.name)
        for arg in node.args.args:
            arg.arg = self._canonical_var(arg.arg)
        node.body = self._strip_docstrings(node.body)
        self.generic_visit(node)
        return node

    def visit_ClassDef(self, node: ast.ClassDef) -> ast.ClassDef:
        """Strip class-level docstrings."""
        node.body = self._strip_docstrings(node.body)
        self.generic_visit(node)
        return node

    def visit_Name(self, node: ast.Name) -> ast.Name:
        """Rename variable references to canonical names."""
        node.id = self._canonical_var(node.id)
        return node

    def visit_Constant(self, node: ast.Constant) -> ast.Constant:
        """Replace every literal value with the placeholder 'CONST'."""
        node.value = "CONST"
        return node

    def visit_Call(self, node: ast.Call) -> ast.Call:
        """
        If the call target is a simple Name (e.g. `foo()`),
        canonicalize it as a function name rather than a variable.
        """
        if isinstance(node.func, ast.Name):
            node.func.id = self._canonical_func(node.func.id)
        else:
            self.visit(node.func)
        for arg_node in node.args:
            self.visit(arg_node)
        for kw in node.keywords:
            self.visit(kw)
        return node


def normalize_ast(tree: ast.AST) -> ast.AST:
    """
    Accept a parsed AST and return a **new** normalized copy.

    The original tree is not mutated.
    Line numbers (lineno, end_lineno) are preserved so that
    downstream hashing can report source locations.
    """
    tree_copy = deepcopy(tree)
    canonicalizer = _NameCanonicalizer()
    normalized = canonicalizer.visit(tree_copy)
    ast.fix_missing_locations(normalized)
    return normalized
