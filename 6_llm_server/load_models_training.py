import os
import torch
from unsloth import FastLanguageModel

# 1. Point to your NFS Hugging Face Cache
# This tells Unsloth to look in your shared drive for the raw weights you just downloaded.
os.environ["HF_HOME"] = "/abr/coss41/shared_workspace/liang_workspace/data/hf_cache"

# 2. Configuration
max_seq_length = 4096  
dtype = None           
load_in_4bit = True    # CRITICAL: Triggers the dynamic NF4 compression

print("Phase 1: Loading raw model from NFS and applying NF4 compression...")
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "Qwen/Qwen2.5-Coder-32B-Instruct", 
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

# 3. Inject LoRA Adapters (The "Learning" Modules)
print("\nPhase 2: Injecting LoRA adapters (all-linear targeting)...")
model = FastLanguageModel.get_peft_model(
    model,
    r = 16, 
    target_modules = [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    lora_alpha = 32,
    lora_dropout = 0, 
    bias = "none",
    use_gradient_checkpointing = "unsloth", # CRITICAL: Saves massive VRAM
    random_state = 3407,
)

# 4. Baseline Sanity Check
print("\nPhase 3: Running inference sanity check...")
FastLanguageModel.for_inference(model) # Switch to faster inference mode temporarily

# Format a prompt using Qwen's specific ChatML tags
test_prompt = "<|im_start|>user\nWrite a simple Javascript function to debounce a button click.<|im_end|>\n<|im_start|>assistant\n"
inputs = tokenizer([test_prompt], return_tensors="pt").to("cuda")

outputs = model.generate(**inputs, max_new_tokens=128, use_cache=True)

print("\n--- BASELINE OUTPUT ---")
print(tokenizer.batch_decode(outputs)[0])
print("-----------------------")
print("\n✅ Script completed successfully. Hardware handshake and architecture are verified.")