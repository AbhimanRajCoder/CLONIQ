"""
unified_normalizer.py
─────────────────────
Language-agnostic normaliser that works on Unified IR dicts
(produced by either the Python or JS/TS parser).

Normalisation rules:
1. Variable identifiers → var_1, var_2, …
2. Function names → func_1, func_2, …
3. Class names → class_1, class_2, …
4. Component names (React) → comp_1, comp_2, …
5. Constant/literal values → "CONST"
6. Docstrings / comments → removed (already absent from AST)
7. Arrow vs function syntax → normalised to same type
8. JSX attribute order → sorted children
9. Hook names (useState, useEffect, …) → hook_1, hook_2, …

Line numbers are PRESERVED for downstream line reporting.
"""

from copy import deepcopy
from typing import Any, Dict, List


# ── React hook prefixes to normalise ─────────────────────────
_REACT_HOOKS = frozenset({
    "useState", "useEffect", "useContext", "useReducer",
    "useCallback", "useMemo", "useRef", "useImperativeHandle",
    "useLayoutEffect", "useDebugValue", "useTransition",
    "useDeferredValue", "useId", "useSyncExternalStore",
    "useInsertionEffect",
})

# ── Node types representing function-like constructs ─────────
_FUNC_TYPES = frozenset({
    "FunctionDef", "AsyncFunctionDef",  # Python
    "FunctionDeclaration", "FunctionExpression",  # JS
    "ArrowFunction", "MethodDefinition", "GeneratorFunction",
})

# ── Node types representing class-like constructs ────────────
_CLASS_TYPES = frozenset({
    "ClassDef",  # Python
    "ClassDeclaration",  # JS/TS
})

# ── JSX component nodes ─────────────────────────────────────
_JSX_COMPONENT_TYPES = frozenset({
    "JSXElement", "JSXSelfClosingElement",
    "JSXOpeningElement", "JSXClosingElement",
})

# ── Trivial nodes too small to hash standalone ───────────────
TRIVIAL_IR_TYPES = frozenset({
    # Python trivial
    "Name", "Constant", "Load", "Store", "Del",
    "Add", "Sub", "Mult", "Div", "Mod", "Pow",
    "LShift", "RShift", "BitOr", "BitXor", "BitAnd",
    "FloorDiv", "And", "Or", "Not", "Invert",
    "UAdd", "USub", "Eq", "NotEq", "Lt", "LtE",
    "Gt", "GtE", "Is", "IsNot", "In", "NotIn",
    "alias", "arg",
    # JS/TS trivial
    "identifier", "string", "number", "true", "false", "null",
    "template_string", "comment", "property_identifier",
    "shorthand_property_identifier", "shorthand_property_identifier_pattern",
})


class UnifiedNormalizer:
    """Stateful normaliser that walks a Unified IR tree and rewrites
    identifiers and constants to canonical placeholders."""

    def __init__(self) -> None:
        self._var_map: Dict[str, str] = {}
        self._func_map: Dict[str, str] = {}
        self._class_map: Dict[str, str] = {}
        self._hook_map: Dict[str, str] = {}
        self._var_counter = 0
        self._func_counter = 0
        self._class_counter = 0
        self._hook_counter = 0

    def _canonical_var(self, name: str) -> str:
        if name not in self._var_map:
            self._var_counter += 1
            self._var_map[name] = f"var_{self._var_counter}"
        return self._var_map[name]

    def _canonical_func(self, name: str) -> str:
        if name not in self._func_map:
            self._func_counter += 1
            self._func_map[name] = f"func_{self._func_counter}"
        return self._func_map[name]

    def _canonical_class(self, name: str) -> str:
        if name not in self._class_map:
            self._class_counter += 1
            self._class_map[name] = f"class_{self._class_counter}"
        return self._class_map[name]

    def _canonical_hook(self, name: str) -> str:
        if name not in self._hook_map:
            self._hook_counter += 1
            self._hook_map[name] = f"hook_{self._hook_counter}"
        return self._hook_map[name]

    def normalize(self, ir: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise a Unified IR tree (destructively modifies in place)."""
        node_type = ir.get("type", "")

        # ── Function names ───────────────────────────────────
        if node_type in _FUNC_TYPES and "name" in ir:
            ir["name"] = self._canonical_func(ir["name"])
            # Normalise arguments
            if "args" in ir:
                ir["args"] = [self._canonical_var(a) for a in ir["args"]]

        # ── Class names ──────────────────────────────────────
        elif node_type in _CLASS_TYPES and "name" in ir:
            ir["name"] = self._canonical_class(ir["name"])

        # ── JSX components ───────────────────────────────────
        elif node_type in _JSX_COMPONENT_TYPES and "name" in ir:
            ir["name"] = self._canonical_func(ir["name"])

        # ── Hook names ───────────────────────────────────────
        elif node_type == "CallExpression":
            # Check if the call target is a React hook
            children = ir.get("children", [])
            if children:
                first_child = children[0]
                fname = first_child.get("name", "")
                if fname in _REACT_HOOKS:
                    first_child["name"] = self._canonical_hook(fname)
                elif "name" in first_child:
                    first_child["name"] = self._canonical_func(first_child["name"])

        # ── Variable identifiers ─────────────────────────────
        elif "name" in ir and node_type not in (
            "ImportDeclaration", "ExportDeclaration",
            "Import", "ImportFrom",
        ):
            ir["name"] = self._canonical_var(ir["name"])

        # ── Constants / literals ─────────────────────────────
        if "value" in ir:
            ir["value"] = "CONST"

        # ── Normalise ArrowFunction → FunctionDeclaration ────
        if node_type == "ArrowFunction":
            ir["type"] = "FunctionDeclaration"

        # ── Sort JSXAttribute children for order invariance ──
        if node_type in ("JSXOpeningElement", "JSXSelfClosingElement"):
            attrs = [c for c in ir.get("children", []) if c.get("type") == "JSXAttribute"]
            non_attrs = [c for c in ir.get("children", []) if c.get("type") != "JSXAttribute"]
            attrs.sort(key=lambda a: a.get("name", ""))
            ir["children"] = non_attrs + attrs

        # ── Recurse into children ────────────────────────────
        for child in ir.get("children", []):
            self.normalize(child)

        return ir


def normalize_ir(ir: Dict[str, Any]) -> Dict[str, Any]:
    """Accept a Unified IR dict and return a normalised deep copy.

    The original IR is not mutated.
    """
    ir_copy = deepcopy(ir)
    normalizer = UnifiedNormalizer()
    return normalizer.normalize(ir_copy)
