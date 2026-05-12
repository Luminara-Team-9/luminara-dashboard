from datasets import load_dataset

# Stream only the first 1000 examples of TypeScript to look for performance patterns
ds = load_dataset("bigcode/the-stack-v2", data_dir="data/typescript", 
                  split="train", streaming=True, token="your_hf_token")

for example in ds.take(5):
    print(example['content'][:500]) # Peek at the real human code