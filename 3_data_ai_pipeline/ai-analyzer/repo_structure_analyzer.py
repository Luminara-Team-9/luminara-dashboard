from pathlib import Path
import json

SUPPORTED_EXTENSIONS = {
    ".tsx", ".ts", ".jsx", ".js", ".css", ".mjs", ".cjs", ".json"
}

IGNORED_DIRS = {
    "node_modules", ".next", "dist", "build", ".git", ".turbo", "coverage", ".cache"
}


def should_ignore(path: Path) -> bool:
    return any(part in IGNORED_DIRS for part in path.parts)


def detect_framework(root: Path) -> str:
    package_json = root / "package.json"

    if not package_json.exists():
        return "unknown"

    try:
        data = json.loads(package_json.read_text(encoding="utf-8"))
    except Exception:
        return "unknown"

    deps = {}
    deps.update(data.get("dependencies", {}))
    deps.update(data.get("devDependencies", {}))

    if "next" in deps:
        return "Next.js"
    if "vite" in deps:
        return "Vite"
    if "react" in deps:
        return "React"

    return "unknown"


def classify_file(path: Path, root: Path) -> list[str]:
    rel = str(path.relative_to(root)).lower()
    tags = []

    if "page.tsx" in rel or "page.jsx" in rel or "/pages/" in rel or "/app/" in rel:
        tags.append("pages")

    if "component" in rel or "components" in rel:
        tags.append("components")

    if "widget" in rel or "widgets" in rel:
        tags.append("widgets")

    if "entity" in rel or "entities" in rel:
        tags.append("entities")

    if path.suffix == ".css" or "style" in rel:
        tags.append("styles")

    if "next.config" in rel or "vite.config" in rel or "webpack.config" in rel:
        tags.append("config_files")

    if "middleware" in rel or "/api/" in rel or "server" in rel:
        tags.append("server_files")

    if any(k in rel for k in ["image", "img", "hero", "banner", "gallery", "thumbnail"]):
        tags.append("image_related_files")

    if any(k in rel for k in ["script", "analytics", "tracker", "provider", "layout"]):
        tags.append("javascript_related_files")

    return tags


def analyze_repo(target_root: str) -> dict:
    root = Path(target_root).resolve()

    if not root.exists():
        raise FileNotFoundError(f"target_root does not exist: {root}")

    repo_map = {
        "target_root": str(root),
        "framework": detect_framework(root),
        "pages": [],
        "components": [],
        "widgets": [],
        "entities": [],
        "styles": [],
        "config_files": [],
        "server_files": [],
        "image_related_files": [],
        "javascript_related_files": [],
        "all_source_files": [],
    }

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        if should_ignore(path):
            continue

        if path.suffix not in SUPPORTED_EXTENSIONS:
            continue

        rel_path = str(path.relative_to(root))
        repo_map["all_source_files"].append(rel_path)

        for tag in classify_file(path, root):
            repo_map[tag].append(rel_path)

    return repo_map


def save_repo_map(target_root: str, output_path: str = "repo_map.json") -> dict:
    repo_map = analyze_repo(target_root)

    output = Path(output_path)
    output.write_text(
        json.dumps(repo_map, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )

    print(f"✅ repo_map saved: {output.resolve()}")
    print(f"Framework: {repo_map['framework']}")
    print(f"Total source files: {len(repo_map['all_source_files'])}")
    print(f"Pages: {len(repo_map['pages'])}")
    print(f"Components: {len(repo_map['components'])}")
    print(f"Images: {len(repo_map['image_related_files'])}")
    print(f"JS-related: {len(repo_map['javascript_related_files'])}")
    print(f"Server/config: {len(repo_map['server_files']) + len(repo_map['config_files'])}")

    return repo_map


if __name__ == "__main__":
    target_root = "/abr/coss41/Luminara_App/Agent_Workspace/fix_plan_manual_group_main_decathlon_main_desktop_9_decathlon_main_desktop/repo/2_digital_twins/active-staging"

    save_repo_map(
        target_root=target_root,
        output_path="repo_map.json"
    )