#!/usr/bin/env python3
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""bSim Release Pipeline Automation Script.

Provides subcommands to detect version, bump version, run tests, merge branches,
push releases, or execute the complete end-to-end transaction-safe release loop.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Tracking 7 designated files containing bSim version numbers
TRACKED_FILES = [
    "index.html",
    "js/app.js",
    "js/sim.js",
    "js/modules/debug_terminal.js",
    "js/modules/interaction.js",
    "js/modules/project_io.js",
    "tests/test_interaction.py",
]


class ReleasePipeline:
    def __init__(self, repo_dir: Path):
        self.repo_dir = repo_dir
        self.original_branch = None
        self.stashed = False
        self.merge_started = False
        self.committed = False
        self.bumped = False
        self.old_version = None
        self.new_version = None

    def run_cmd(self, cmd: str) -> str:
        """Run a shell command within the repo directory, cleaning up UV virtual environment overrides."""
        env = os.environ.copy()
        if "VIRTUAL_ENV" in env:
            del env["VIRTUAL_ENV"]
        if "PYTHONPATH" in env:
            del env["PYTHONPATH"]
        if "PATH" in env:
            paths = env["PATH"].split(os.pathsep)
            filtered_paths = [p for p in paths if ".venv" not in p and ".cache/uv" not in p]
            env["PATH"] = os.pathsep.join(filtered_paths)

        res = subprocess.run(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=str(self.repo_dir),
            env=env,
        )
        if res.returncode != 0:
            raise subprocess.CalledProcessError(
                res.returncode, cmd, output=res.stdout, stderr=res.stderr
            )
        return res.stdout.strip()

    def detect_version(self) -> str:
        """Extract the current active version string from js/app.js."""
        app_js_path = self.repo_dir / "js" / "app.js"
        if not app_js_path.exists():
            raise FileNotFoundError(f"Could not find js/app.js at {app_js_path}")

        content = app_js_path.read_text(encoding="utf-8")
        # Pattern: window.LOADED_BSIM_VERSION = "1.27.23";
        match = re.search(r'window\.LOADED_BSIM_VERSION\s*=\s*"([^"]+)"', content)
        if not match:
            raise ValueError("Could not find window.LOADED_BSIM_VERSION in js/app.js")
        return match.group(1)

    def calculate_next_version(self, current_ver: str) -> str:
        """Increment patch version by +0.00.01 (e.g. 1.27.23 -> 1.27.24)."""
        parts = current_ver.split(".")
        if len(parts) != 3:
            raise ValueError(f"Version string '{current_ver}' is not in major.minor.patch format")
        
        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
        patch += 1
        return f"{major}.{minor}.{patch}"

    def bump_files(self, old_ver: str, new_ver: str):
        """Uniformly replace all exact occurrences of old_ver with new_ver in tracked files."""
        for rel_path in TRACKED_FILES:
            file_path = self.repo_dir / rel_path
            if not file_path.exists():
                raise FileNotFoundError(f"Tracked file missing: {rel_path}")

            content = file_path.read_text(encoding="utf-8")
            if old_ver not in content:
                print(f"Warning: version '{old_ver}' not found in {rel_path}", file=sys.stderr)
            
            updated_content = content.replace(old_ver, new_ver)
            file_path.write_text(updated_content, encoding="utf-8")
        self.bumped = True

    def run_tests(self) -> str:
        """Execute the python integration test suite."""
        test_script = self.repo_dir / "tests" / "run_tests.py"
        if not test_script.exists():
            raise FileNotFoundError("Could not find test runner at tests/run_tests.py")
        
        # We explicitly discard pycache to ensure Python doesn't complain about modified cached bytecode
        for pycache in self.repo_dir.glob("**/__pycache__"):
            try:
                for f in pycache.glob("*.pyc"):
                    f.unlink()
            except Exception:
                pass

        return self.run_cmd("python3 tests/run_tests.py")

    def safe_stash(self):
        """Stash any uncommitted local modifications before changing branches."""
        status = self.run_cmd("git status --porcelain")
        if status:
            print("Workspace dirty. Saving temporary stash...", file=sys.stderr)
            self.run_cmd('git stash save "bsim_release_temp_stash"')
            self.stashed = True

    def safe_unstash(self):
        """Restore local modifications if they were stashed."""
        if self.stashed:
            print("Restoring stashed changes...", file=sys.stderr)
            try:
                self.run_cmd("git stash pop")
                self.stashed = False
            except Exception as e:
                print(f"Warning: Failed to pop stash automatically: {e}", file=sys.stderr)

    def checkout_branch(self, branch: str):
        """Checkout a branch, setting original_branch first if not already tracked."""
        if not self.original_branch:
            self.original_branch = self.run_cmd("git rev-parse --abbrev-ref HEAD")
        
        if self.original_branch != branch:
            self.run_cmd(f"git checkout {branch}")

    def pull_rebase(self, branch: str):
        """Pull latest remote updates cleanly with rebase."""
        try:
            self.run_cmd(f"git pull --rebase origin {branch}")
        except subprocess.CalledProcessError as e:
            # Abort if git pull rebase got stuck
            try:
                self.run_cmd("git rebase --abort")
            except Exception:
                pass
            raise e

    def merge_source(self, source: str):
        """Merge source branch into current target branch."""
        self.merge_started = True
        try:
            self.run_cmd(f"git merge {source} --no-edit")
        except subprocess.CalledProcessError as e:
            # Abort merge if it failed with conflicts
            try:
                self.run_cmd("git merge --abort")
            except Exception:
                pass
            self.merge_started = False
            raise e

    def commit_and_push(self, branch: str, new_ver: str):
        """Stage, commit and push changes to remote."""
        for rel_path in TRACKED_FILES:
            self.run_cmd(f"git add {rel_path}")
        
        self.run_cmd(f'git commit -m "Release v{new_ver}"')
        self.committed = True
        
        self.run_cmd(f"git push origin {branch}")

    def rollback(self):
        """Perform safety rollback on failure, returning repo to pristine pre-run state."""
        print("Executing automated rollback to restore original workspace state...", file=sys.stderr)
        
        # 1. Abort any active merge
        if self.merge_started:
            try:
                self.run_cmd("git merge --abort")
            except Exception:
                pass

        # 2. Revert any committed files if they were committed locally but push failed
        if self.committed:
            try:
                self.run_cmd("git reset --hard HEAD~1")
            except Exception:
                pass

        # 3. Discard any local bumped file changes
        if self.bumped:
            try:
                for rel_path in TRACKED_FILES:
                    self.run_cmd(f"git checkout -- {rel_path}")
            except Exception:
                pass

        # 4. Switch back to original branch
        if self.original_branch:
            try:
                self.run_cmd(f"git checkout {self.original_branch}")
            except Exception:
                pass

        # 5. Restore stashed modifications
        if self.stashed:
            self.safe_unstash()


def write_output(data: dict, output_file: str):
    """Serialize execution summary to output JSON file."""
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Success! Output detail written to: {output_file}")
    except Exception as e:
        print(f"Error writing to output file {output_file}: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="bSim Release Pipeline Automation Command Line Utility."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # --- Subcommand: detect ---
    p_detect = subparsers.add_parser("detect", help="Extract current bSim version string.")
    p_detect.add_argument("--output", required=True, help="Output JSON file path.")

    # --- Subcommand: bump ---
    p_bump = subparsers.add_parser("bump", help="Bump version across the 7 tracked files.")
    p_bump.add_argument("--to", help="Explicit version string target (e.g. 1.27.24).")
    p_bump.add_argument("--output", required=True, help="Output JSON file path.")

    # --- Subcommand: test ---
    p_test = subparsers.add_parser("test", help="Execute the integration test suite.")
    p_test.add_argument("--output", required=True, help="Output JSON file path.")

    # --- Subcommand: merge ---
    p_merge = subparsers.add_parser("merge", help="Merge source branch into target branch safely.")
    p_merge.add_argument("--source", default="debug", help="Source development branch.")
    p_merge.add_argument("--target", default="main", help="Target release branch.")
    p_merge.add_argument("--output", required=True, help="Output JSON file path.")

    # --- Subcommand: push ---
    p_push = subparsers.add_parser("push", help="Commit bumped versions and push target branch to remote.")
    p_push.add_argument("--target", default="main", help="Release branch to push.")
    p_push.add_argument("--output", required=True, help="Output JSON file path.")

    # --- Subcommand: run (End-to-End) ---
    p_run = subparsers.add_parser("run", help="Orchestrate the complete release pipeline with safe rollback.")
    p_run.add_argument("--source", default="debug", help="Source branch to merge from.")
    p_run.add_argument("--target", default="main", help="Target release branch to merge into and push.")
    p_run.add_argument("--output", required=True, help="Output JSON file path.")

    args = parser.parse_args()
    repo_path = Path(__file__).resolve().parent
    pipe = ReleasePipeline(repo_path)
    result = {"status": "error", "command": args.command}

    try:
        if args.command == "detect":
            version = pipe.detect_version()
            result = {
                "status": "success",
                "current_version": version,
                "components": version.split(".")
            }
            print(f"Current version detected: {version}")

        elif args.command == "bump":
            current_ver = pipe.detect_version()
            next_ver = args.to if args.to else pipe.calculate_next_version(current_ver)
            print(f"Bumping version from {current_ver} -> {next_ver}...")
            pipe.bump_files(current_ver, next_ver)
            result = {
                "status": "success",
                "previous_version": current_ver,
                "bumped_version": next_ver,
                "files_updated": TRACKED_FILES
            }
            print("Successfully updated version across all 7 tracked files.")

        elif args.command == "test":
            print("Running integration tests...")
            test_output = pipe.run_tests()
            result = {
                "status": "success",
                "test_output": test_output
            }
            print("All integration tests passed successfully.")

        elif args.command == "merge":
            print(f"Stashing local changes and checking out target branch '{args.target}'...")
            pipe.safe_stash()
            pipe.checkout_branch(args.target)
            print(f"Pulling latest remote changes for '{args.target}' with rebase...")
            pipe.pull_rebase(args.target)
            print(f"Merging development branch '{args.source}'...")
            pipe.merge_source(args.source)
            result = {
                "status": "success",
                "source": args.source,
                "target": args.target
            }
            print("Merged source branch cleanly.")
            pipe.safe_unstash()

        elif args.command == "push":
            current_ver = pipe.detect_version()
            print(f"Staging modifications, committing, and pushing '{args.target}' to origin...")
            pipe.commit_and_push(args.target, current_ver)
            result = {
                "status": "success",
                "target": args.target,
                "version": current_ver
            }
            print(f"Successfully pushed version {current_ver} to remote.")

        elif args.command == "run":
            # FULL LOOP
            print("Starting End-to-End Release Pipeline...")
            
            # 1. Detect current version
            old_ver = pipe.detect_version()
            new_ver = pipe.calculate_next_version(old_ver)
            print(f"Pipeline detected old version: {old_ver}. Target new version: {new_ver}.")

            # 2. Stash local changes
            pipe.safe_stash()

            # 3. Checkout and rebase target branch
            print(f"Switching to target branch '{args.target}'...")
            pipe.checkout_branch(args.target)
            print(f"Pulling remote target updates cleanly...")
            pipe.pull_rebase(args.target)

            # 4. Merge source development branch
            print(f"Merging development branch '{args.source}' into '{args.target}'...")
            pipe.merge_source(args.source)

            # 5. Bump version
            print(f"Performing version bump {old_ver} -> {new_ver} across tracked files...")
            pipe.bump_files(old_ver, new_ver)

            # 6. Run test suite
            print("Running integration tests on release build...")
            test_log = pipe.run_tests()
            print("Test suite successfully passed.")

            # 7. Commit and push
            print(f"Staging, committing, and pushing release v{new_ver}...")
            pipe.commit_and_push(args.target, new_ver)

            # 8. Unstash original work
            print("Restoring developer environment...")
            if pipe.original_branch:
                pipe.checkout_branch(pipe.original_branch)
            pipe.safe_unstash()

            result = {
                "status": "success",
                "previous_version": old_ver,
                "released_version": new_ver,
                "source_branch": args.source,
                "target_branch": args.target,
                "files_updated": TRACKED_FILES,
                "test_log": test_log
            }
            print(f"Release Pipeline Completed! Successfully deployed v{new_ver}.")

    except Exception as e:
        print(f"Pipeline execution encountered error: {e}", file=sys.stderr)
        if isinstance(e, subprocess.CalledProcessError):
            print(f"Command failed: {e.cmd}\nStdout:\n{e.output}\nStderr:\n{e.stderr}", file=sys.stderr)
        
        # Run safe rollback
        if args.command == "run":
            pipe.rollback()
        
        result = {
            "status": "error",
            "error_message": str(e),
            "command": args.command
        }
        write_output(result, args.output)
        sys.exit(1)

    write_output(result, args.output)


if __name__ == "__main__":
    main()
