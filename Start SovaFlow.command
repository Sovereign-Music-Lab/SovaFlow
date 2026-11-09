#!/bin/bash
# Double-click on macOS to open the SovaFlow menu. Nothing is installed system-wide.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org (22 or newer), then double-click this file again."
  echo "Node.js가 없습니다. https://nodejs.org 에서 LTS(22 이상)를 설치한 뒤 다시 더블클릭하세요."
  read -r -p "Press Enter to close / Enter를 누르면 닫힙니다 " _
  exit 1
fi
node bin/sovaflow.mjs menu
read -r -p "Press Enter to close / Enter를 누르면 닫힙니다 " _
