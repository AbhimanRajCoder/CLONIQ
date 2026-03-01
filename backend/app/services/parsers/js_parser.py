"""
parsers/js_parser.py
────────────────────
Parses JavaScript (.js, .jsx) and TypeScript (.ts, .tsx) source files
using Python Tree-sitter bindings and converts them into the Unified
AST IR dict compatible with the language-agnostic pipeline.

Dependencies: tree-sitter, tree-sitter-javascript, tree-sitter-typescript
"""

from typing import Any, Dict, List, Optional

import tree_sitter_javascript as tsjs
import tree_sitter_typescript as tsts
from tree_sitter import Language, Parser, Node

# ── Language objects (initialised once) ──────────────────────
_JS_LANGUAGE = Language(tsjs.language())
_TSX_LANGUAGE = Language(tsts.language_tsx())
_TS_LANGUAGE = Language(tsts.language_typescript())


def _get_parser(filename: str, lang_hint: str) -> Parser:
    """Return a Tree-sitter parser configured for the right language."""
    parser = Parser()
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in ("tsx",):
        parser.language = _TSX_LANGUAGE
    elif ext in ("ts",):
        parser.language = _TS_LANGUAGE
    elif ext in ("jsx", "js"):
        parser.language = _JS_LANGUAGE
    elif lang_hint == "typescript":
        parser.language = _TSX_LANGUAGE  # TSX is a superset
    else:
        parser.language = _JS_LANGUAGE

    return parser


# ── Node-type mapping (Tree-sitter → Unified IR labels) ─────
_TS_TO_UNIFIED: Dict[str, str] = {
    # Functions
    "function_declaration":       "FunctionDeclaration",
    "function":                   "FunctionExpression",
    "arrow_function":             "ArrowFunction",
    "generator_function_declaration": "GeneratorFunction",
    "method_definition":          "MethodDefinition",

    # Variables & assignments
    "variable_declaration":       "VariableDeclaration",
    "variable_declarator":        "VariableDeclarator",
    "assignment_expression":      "AssignmentExpression",

    # Control flow
    "if_statement":               "IfStatement",
    "else_clause":                "ElseClause",
    "switch_statement":           "SwitchStatement",
    "switch_case":                "SwitchCase",
    "for_statement":              "ForStatement",
    "for_in_statement":           "ForInStatement",
    "while_statement":            "WhileStatement",
    "do_statement":               "DoWhileStatement",
    "try_statement":              "TryStatement",
    "catch_clause":               "CatchClause",
    "return_statement":           "ReturnStatement",
    "throw_statement":            "ThrowStatement",

    # Expressions
    "call_expression":            "CallExpression",
    "new_expression":             "NewExpression",
    "member_expression":          "MemberExpression",
    "binary_expression":          "BinaryExpression",
    "unary_expression":           "UnaryExpression",
    "ternary_expression":         "ConditionalExpression",
    "template_string":            "TemplateLiteral",
    "spread_element":             "SpreadElement",
    "await_expression":           "AwaitExpression",
    "yield_expression":           "YieldExpression",

    # Classes
    "class_declaration":          "ClassDeclaration",
    "class_body":                 "ClassBody",

    # Modules
    "import_statement":           "ImportDeclaration",
    "export_statement":           "ExportDeclaration",
    "import_specifier":           "ImportSpecifier",
    "export_specifier":           "ExportSpecifier",

    # JSX
    "jsx_element":                "JSXElement",
    "jsx_self_closing_element":   "JSXSelfClosingElement",
    "jsx_opening_element":        "JSXOpeningElement",
    "jsx_closing_element":        "JSXClosingElement",
    "jsx_attribute":              "JSXAttribute",
    "jsx_expression":             "JSXExpression",
    "jsx_fragment":               "JSXFragment",

    # Misc
    "program":                    "Module",
    "statement_block":            "Block",
    "expression_statement":       "ExpressionStatement",
    "lexical_declaration":        "VariableDeclaration",
    "pair":                       "Property",
    "object":                     "ObjectExpression",
    "array":                      "ArrayExpression",

    # TypeScript-specific
    "type_alias_declaration":     "TypeAlias",
    "interface_declaration":      "InterfaceDeclaration",
    "enum_declaration":           "EnumDeclaration",
    "type_annotation":            "TypeAnnotation",
}


def _node_to_ir(node: Node, source_bytes: bytes) -> Optional[Dict[str, Any]]:
    """Recursively convert a Tree-sitter Node to a Unified IR dict."""
    # Skip nodes that are purely punctuation / whitespace
    if not node.is_named:
        return None

    ts_type = node.type
    unified_type = _TS_TO_UNIFIED.get(ts_type, ts_type)

    children: List[Dict[str, Any]] = []
    for child in node.children:
        child_ir = _node_to_ir(child, source_bytes)
        if child_ir is not None:
            children.append(child_ir)

    ir: Dict[str, Any] = {
        "type": unified_type,
        "children": children,
        "start_line": node.start_point[0] + 1,  # Tree-sitter is 0-indexed
        "end_line": node.end_point[0] + 1,
    }

    # Extract identifier names for normalisation
    if ts_type == "identifier":
        ir["name"] = node.text.decode("utf-8", errors="replace")
    elif ts_type in ("string", "template_string", "number", "true", "false", "null"):
        ir["value"] = node.text.decode("utf-8", errors="replace")

    return ir


def parse_js_ts(
    source: str,
    filename: str = "<uploaded>",
    lang: str = "javascript",
) -> Dict[str, Any]:
    """Parse JS/JSX/TS/TSX source into a Unified IR dict.

    Parameters
    ----------
    source : str
        The source code string.
    filename : str
        Original filename (used for extension detection).
    lang : str
        Language hint ("javascript" or "typescript").

    Returns
    -------
    Dict[str, Any]
        Unified IR tree.
    """
    parser = _get_parser(filename, lang)
    source_bytes = source.encode("utf-8")
    tree = parser.parse(source_bytes)

    if tree.root_node.has_error:
        # Still produce the IR – Tree-sitter is error-tolerant
        pass

    ir = _node_to_ir(tree.root_node, source_bytes)
    if ir is None:
        ir = {"type": "Module", "children": [], "start_line": 1, "end_line": 1}

    ir["language"] = lang
    return ir
