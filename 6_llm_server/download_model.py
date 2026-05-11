import os
from huggingface_hub import snapshot_download

# Point to your NFS drive
os.environ["HF_HOME"] = "/abr/coss41/shared_workspace/liang_workspace/data/hf_cache"

print("Downloading unquantized Qwen2.5-32B to NFS. This will take a while...")
snapshot_download(
    repo_id="Qwen/Qwen2.5-Coder-32B-Instruct",
    ignore_patterns=["*.pt", "*.h5", "*.msgpack"], # Only grab the necessary safetensors
)
print("Download complete!")