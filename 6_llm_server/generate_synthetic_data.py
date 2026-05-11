import json
import os
from openai import OpenAI
from tqdm import tqdm

# Connect to your local vLLM Teacher
client = OpenAI(base_url="http://localhost:8000/v1", api_key="sk-local")

SYSTEM_PROMPT = """You are an expert Web Performance Engineer. 
Generate a simulated web performance bug and its fix to train an AI agent.
Strictly output a JSON object with two keys:
1. "user_prompt": Describe a Lighthouse audit failure and provide a realistic React/Next.js code snippet causing it.
2. "assistant_response": Write the remediation. MUST include a <think> reasoning block and a <patch> block containing valid JSON with 'file_path', 'explanation', 'search_block', and 'replace_block'."""

# We will generate 100 for a test run (scale this to 5000 later)
NUM_EXAMPLES = 100
OUTPUT_FILE = "/abr/coss41/shared_workspace/liang_workspace/data/synthetic_sft_dataset.jsonl"

print(f"Generating {NUM_EXAMPLES} synthetic training pairs...")

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    for i in tqdm(range(NUM_EXAMPLES)):
        try:
            response = client.chat.completions.create(
                model="deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": "Generate a unique performance issue involving unused JavaScript or render-blocking CSS."}
                ],
                response_format={"type": "json_object"}
            )
            
            # Extract the JSON and format it into ShareGPT style for Unsloth
            teacher_output = json.loads(response.choices[0].message.content)
            
            sharegpt_format = {
                "conversations": [
                    {"from": "user", "value": teacher_output["user_prompt"]},
                    {"from": "assistant", "value": teacher_output["assistant_response"]}
                ]
            }
            
            f.write(json.dumps(sharegpt_format) + "\n")
            
        except Exception as e:
            print(f"Error on iteration {i}: {e}")

print("Dataset generation complete!")


