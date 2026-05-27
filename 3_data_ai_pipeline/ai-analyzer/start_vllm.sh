#!/bin/bash
#SBATCH --job-name=luminara-vllm
#SBATCH --partition=p02
#SBATCH --nodelist=DIS02
#SBATCH --gres=gpu:1
#SBATCH --time=7-00:00:00
#SBATCH --output=/abr/coss41/logs/vllm-%j.out
#SBATCH --error=/abr/coss41/logs/vllm-%j.err

mkdir -p /abr/coss41/logs

echo "[vllm] Starting on $(hostname) at $(date)"
echo "[vllm] GPU: $CUDA_VISIBLE_DEVICES"

python -m vllm.entrypoints.openai.api_server \
  --model /abr/coss41/shared_workspace/yuyu_workspace/data/models/qwen32b-int4 \
  --host 0.0.0.0 \
  --port 8000 \
  --gpu-memory-utilization 0.90 \
  --max-model-len 8192

echo "[vllm] Server exited at $(date)"
