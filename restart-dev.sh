#!/bin/bash

# --- Color Definitions ---
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}=== Trading Agent 开发环境一键重启工具 ===${NC}"

# 1. 清理已有的开发进程
echo -e "${YELLOW}[1/3] 正在清理已有的旧进程 (Mastra, Renderer, Electron, Nodemon)...${NC}"
pkill -f "mastra" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "electron" 2>/dev/null
pkill -f "nodemon" 2>/dev/null

# 2. 释放端口 3000 和 4111
for PORT in 3000 4111; do
  PORT_PIDS=$(lsof -ti :$PORT)
  if [ ! -z "$PORT_PIDS" ]; then
    echo -e "${YELLOW}发现 ${PORT} 端口被占用，正在释放 PID: ${PORT_PIDS}...${NC}"
    kill -9 $PORT_PIDS 2>/dev/null
  fi
done

sleep 1.5

# 3. 重新构建共享包以防止类型/模块不一致
echo -e "${YELLOW}[2/3] 正在重新编译共享依赖包 (@trading-agent/shared)...${NC}"
(cd packages/shared && npm run build)

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ 共享包编译失败！请检查 TypeScript 类型定义。${NC}"
  exit 1
fi

echo -e "${GREEN}✓ 编译成功！${NC}"

# 4. 启动开发服务
echo -e "${GREEN}[3/3] 正在启动应用开发服务...${NC}"
npm run dev
