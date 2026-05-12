import json
import random
import re  # ADDED: Required for the extract_json function
import time  # FIXED: Required for sleep
from openai import OpenAI
from tqdm import tqdm

# 1. Connect to the Teacher Engine (.venv-serve)
client = OpenAI(base_url="http://127.0.0.1:8000/v1", api_key="sk-local")

SYSTEM_PROMPT = """You are a Principal Web Performance SRE and Browser Engine Expert creating training data for an AI agent.
Your task is to generate elite, hyper-realistic web performance bug scenarios and their architectural remediations.

Strictly output a raw JSON object with exactly two keys:
1. "user_prompt": Describe a complex, enterprise-grade performance failure. You MUST include the Framework, Component, Device/Network Profile, the failing CWV Metric, a specific Swetrix (RUM Field data) vs Lighthouse (Lab data) discrepancy, and the flawed code snippet.
2. "assistant_response": Write the perfect architectural fix. 

RULES FOR ASSISTANT RESPONSE:
- MUST include a <think> block. You MUST analyze the bottleneck explicitly through the lens of browser-engine physics (e.g., V8 Engine Garbage Collection, Network TCP/QUIC, CSSOM, Compositor Thread, Speculative Parsing). Explain why Swetrix caught it differently than Lighthouse, and how the fix fulfills the RAIL aspect.
- MUST include a <patch> block containing strictly valid JSON with 'file_path', 'explanation', 'search_block', and 'replace_block'.
- DO NOT wrap the output in markdown formatting. Output raw JSON only."""

# ==============================================================================
# SHARED ECOSYSTEM CONSTANTS (UN-STRIPPED & EXPANDED)
# ==============================================================================
FRAMEWORKS = [
    "Next.js 14 (App Router, React Server Components, Suspense)", 
    "Next.js 13 (Pages Router, heavy hydration)", 
    "React 18 (Vite, Client-Side Rendering, React.lazy)",
    "Remix (Loaders, Actions, Edge Runtimes)",
    "Astro (Islands Architecture, zero-JS by default)",
    "Vue 3 / Nuxt 3 (Composition API, SSR)",
    "Angular 17 (Standalone components, RxJS streams)",
    "SolidJS (Fine-grained reactivity, no Virtual DOM)",
    "Qwik (Resumability, delayed execution)"
]

DEVICES = [
    "Mobile (Moto G4, 6x CPU Throttling, Slow 3G latency)",
    "Mobile (iPhone 12, Unthrottled, Spotty 4G with packet loss)",
    "Desktop (Corporate VPN, high latency, throttled bandwidth)",
    "Desktop (Unthrottled Fiber, M3 Mac, 120Hz display)",
    "Smart TV (Low-end WebKit browser, severe memory constraints)"
]

# ==============================================================================
# MODULE A: THE 80% OMNI-MATRIX (FOUNDATIONAL PHYSICS)
# ==============================================================================
COMPONENTS = [
    "Above-the-fold Hero Video Background with WebM/mp4 fallbacks",
    "Interactive Product Carousel with 50+ high-res thumbnails",
    "Complex Client-Side Search Autocomplete Modal (Debounced with API calls)",
    "Infinite Scroll Data Grid utilizing IntersectionObserver and Virtualization",
    "Third-Party Marketing Pixel / Google Tag Manager Integration container",
    "Global Navigation Mega-Menu with hover-intent delays and complex CSS grid",
    "Multi-step Checkout Form using heavy Zod/Yup validation and Stripe elements",
    "Live Chat Support Widget embedded via third-party iFrame",
    "Real-time Data Dashboard rendering 5,000+ SVG DOM nodes via WebSockets",
    "Rich Text Editor (Draft.js/Quill) with autosave functionality",
    "Cookie Consent Modal with dynamic geofencing",
    "WebGL 3D Product Configurator (Three.js context)",
    "Virtualized Financial Data Table updating 100 rows per second"
]

METRIC_CAUSE_MAP = {
    "LCP (Largest Contentful Paint)": [
        {"domain": "Network Pipeline", "cause": "Critical hero image is lazy-loaded (`loading='lazy'`) instead of eagerly fetched.", "audit": "lcp-lazy-loaded", "rum_discrepancy": "Lighthouse flags it, but Swetrix shows catastrophic LCP on slow connections due to delayed fetch start.", "rail": "Load"},
        {"domain": "Preload Scanner", "cause": "LCP image is loaded via CSS `background-image`, hiding it from the HTML preload scanner.", "audit": "largest-contentful-paint-element", "rum_discrepancy": "Locally fast, but Swetrix shows severe LCP delays on high-latency networks because the image fetch starts late.", "rail": "Load"},
        {"domain": "Browser Resource Heuristics", "cause": "Hero image lacks `fetchpriority='high'`, causing the browser heuristic to fetch heavy JS bundles first.", "audit": "prioritize-lcp-image", "rum_discrepancy": "Swetrix indicates LCP image is the 15th item downloaded in the network waterfall.", "rail": "Load"},
        {"domain": "Image Decoding", "cause": "Serving a massive unoptimized 4K PNG instead of a properly sized WebP/AVIF format.", "audit": "modern-image-formats", "rum_discrepancy": "Lighthouse flags format, Swetrix shows main thread freezing during image decode on low-end Androids.", "rail": "Load"},
        {"domain": "React Soft-Navigation", "cause": "Client-side SPA routing forces a hard re-render of the LCP element without preserving state, triggering a new LCP calculation.", "audit": "server-response-time", "rum_discrepancy": "Lighthouse only tests initial load (passes); Swetrix catches soft-navigation LCP failures on subsequent route clicks.", "rail": "Load"}
    ],
    "INP (Interaction to Next Paint) / TBT (Total Blocking Time)": [
        {"domain": "V8 Main Thread", "cause": "Massive React Hydration payload blocking the main thread for 800ms upon initialization.", "audit": "bootup-time", "rum_discrepancy": "Lighthouse shows TBT of 100ms, Swetrix captures first-input INP delays of 900ms as users click during hydration.", "rail": "Response"},
        {"domain": "React Reconciliation", "cause": "Missing useMemo/useCallback causing 3,000 DOM nodes to blindly re-render on a single keystroke.", "audit": "dom-size", "rum_discrepancy": "Lighthouse passes perfectly, Swetrix registers severe INP lag during form typing.", "rail": "Response"},
        {"domain": "Input Event Queuing", "cause": "Non-passive `touchstart` and `wheel` event listeners attached to the `window`.", "audit": "uses-passive-event-listeners", "rum_discrepancy": "Swetrix reports severe scroll jank because the compositor thread is blocked waiting for main thread JS.", "rail": "Animation"},
        {"domain": "Task Starvation", "cause": "Misuse of `requestIdleCallback` causing critical user interactions to be starved by heavy background analytics processing.", "audit": "mainthread-work-breakdown", "rum_discrepancy": "Swetrix detects 1s+ INP when users interact immediately after a route change.", "rail": "Response"},
        {"domain": "Third-Party iFrame Sandbox", "cause": "Marketing tracking pixels (GTM/Meta) executing synchronously and hijacking the main thread.", "audit": "third-party-summary", "rum_discrepancy": "Swetrix shows massive late-page-load INP spikes missed by local AdBlock-enabled Lighthouse runs.", "rail": "Idle"}
    ],
    "CLS (Cumulative Layout Shift)": [
        {"domain": "DOM Reflow", "cause": "Product images or ad slots lacking explicit width/height attributes or CSS aspect-ratio.", "audit": "unsized-images", "rum_discrepancy": "Swetrix flags post-load shifts when images slowly pop in on throttled connections.", "rail": "Load"},
        {"domain": "Layout Calculation", "cause": "Dynamically injected promotional banner pushing content down without `min-height` reserved space.", "audit": "layout-shifts", "rum_discrepancy": "Swetrix catches layout shifts occurring 5 seconds into the session (after async API call returns).", "rail": "Idle"},
        {"domain": "CSS Font Rendering Engine", "cause": "Custom web font swapping late (FOIT/FOUT) without `size-adjust` or fallback font-metrics overrides.", "audit": "font-display", "rum_discrepancy": "Lighthouse scores 0 CLS locally (fonts cached), Swetrix records 0.6 CLS for first-time visitors.", "rail": "Load"},
        {"domain": "Scrollbar Injection", "cause": "Global state changes causing the OS scrollbar to appear/disappear, shifting the entire `100vw` layout horizontally.", "audit": "layout-shifts", "rum_discrepancy": "Mac developers (hidden scrollbars) see 0 CLS; Swetrix catches Windows users experiencing severe horizontal shifts.", "rail": "Load/Response"},
        {"domain": "iFrame Resize", "cause": "Third-party Live Chat widget dynamically expanding its iFrame height post-load without a wrapper skeleton.", "audit": "layout-shifts", "rum_discrepancy": "Lighthouse ignores third-party shifts in some configs, Swetrix catches severe bottom-of-page CLS.", "rail": "Idle"}
    ],
    "TTFB (Time to First Byte) & Network Architecture": [
        {"domain": "Node.js Event Loop", "cause": "Next.js getServerSideProps making sequential, unoptimized database queries (N+1 problem).", "audit": "server-response-time", "rum_discrepancy": "Swetrix shows TTFB tripling during high-traffic hours; Lighthouse CLI runs perfectly in isolated labs.", "rail": "Load"},
        {"domain": "CDN Edge Routing", "cause": "Missing Cache-Control / SWR (Stale-While-Revalidate) headers leading to constant origin server hits.", "audit": "uses-long-cache-ttl", "rum_discrepancy": "Global Swetrix users in Asia experience 1200ms TTFB because requests are routed to US-East instead of Edge.", "rail": "Load"},
        {"domain": "Protocol Fallback", "cause": "HTTP/3 (QUIC) UDP blocked by corporate VPNs, causing a massive TCP fallback negotiation timeout.", "audit": "uses-http2", "rum_discrepancy": "Consumer mobile networks are blazing fast; Swetrix shows B2B corporate desktop users suffering 2s TTFB penalties.", "rail": "Load"},
        {"domain": "Edge Compute Cold Start", "cause": "Middleware (Vercel Edge/Cloudflare Workers) executing heavy JWT decoding logic, causing cold-start latency.", "audit": "server-response-time", "rum_discrepancy": "Lighthouse runs against warm instances. Swetrix captures the 99th percentile cold-start TTFB spikes.", "rail": "Load"}
    ],
    "Memory, BFCache, & Edge Cases": [
        {"domain": "Browser Page Lifecycle", "cause": "BFCache (Back/Forward Cache) eviction because the code uses legacy `unload` event listeners instead of `pagehide`.", "audit": "bfcache", "rum_discrepancy": "Lighthouse cannot test history navigation; Swetrix shows terrible load times (3s+) for users hitting the browser 'Back' button.", "rail": "Load"},
        {"domain": "WebSockets/Connections", "cause": "Active WebSocket connections not explicitly closed during page visibility state changes, blocking BFCache.", "audit": "bfcache", "rum_discrepancy": "Swetrix flags 0% BFCache hit rate across mobile users navigating between product pages.", "rail": "Load"},
        {"domain": "V8 Garbage Collection", "cause": "Severe Memory Leak: Detached DOM nodes caused by un-cleared `setInterval` or event listeners in a React `useEffect` closure.", "audit": "mainthread-work-breakdown", "rum_discrepancy": "Lighthouse scores 100, but Swetrix reports iOS Safari users actively crashing (OOM) after 3 minutes.", "rail": "Idle"},
        {"domain": "V8 Memory Heap Allocation", "cause": "V8 Garbage collection pauses (GC Thrashing) caused by allocating and discarding millions of temporary objects inside a loop.", "audit": "long-tasks", "rum_discrepancy": "Swetrix flags random, intermittent 150ms INP spikes caused by V8 halting the main thread to clean up memory.", "rail": "Animation"}
    ]
}

# ==============================================================================
# MODULE B: THE 20% EVOL-INSTRUCT (HALLUCINATING EDGE CASES)
# ==============================================================================
OBSCURE_WEB_APIS = [
    "Service Workers & CacheStorage", "IntersectionObserver complex thresholds", 
    "WebRTC Data Channels", "IndexedDB transactions", "CSS Houdini (Paint API)", 
    "requestIdleCallback", "BroadcastChannel API", "WebAssembly (Wasm) modules",
    "OffscreenCanvas", "Speculation Rules API (Prerendering)", "WebTransport",
    "SharedWorker cross-tab synchronization", "WebHID / WebBluetooth"
]

BANNED_CAUSES = [
    "lazy loading images", "missing useMemo", "large javascript bundles", 
    "render-blocking CSS", "missing web font display swap", "N+1 database queries",
    "missing Cache-Control headers", "React Hydration overhead",
    "unoptimized images", "missing gzip or brotli", "too many DOM nodes"
]

NUM_EXAMPLES = 5000
OUTPUT_FILE = "/abr/coss41/shared_workspace/liang_workspace/data/synthetic_sft_dataset_apex.jsonl"
EVOL_PROBABILITY = 0.20 

def extract_json(text):
    """
    The JSON Medic: Robustly extracts and cleans JSON from LLM responses.
    """
    try:
        # Try a direct load first
        return json.loads(text)
    except json.JSONDecodeError:
        try:
            # 2. Regex approach: Find content between first { and last }
            match = re.search(r'(\{.*\}|\[.*\])', text, re.DOTALL)
            if match:
                clean_json = match.group(0)
                # 3. Common Fix: Replace single quotes used as property keys (common LLM error)
                # This is a risky regex, but helpful for 'key': 'value' mistakes
                # clean_json = re.sub(r"(\w+)'\s*:", r'"\1":', clean_json) 
                return json.loads(clean_json)
        except:
            pass
        raise ValueError("JSON remains malformed after medical intervention.")

print(f"🚀 Initializing Apex Hybrid Generation ({NUM_EXAMPLES} examples, {int(EVOL_PROBABILITY*100)}% Evol-Instruct)...")

with open(OUTPUT_FILE, "a", encoding="utf-8") as f:
    for i in tqdm(range(NUM_EXAMPLES)):
        
        fwork = random.choice(FRAMEWORKS)
        device = random.choice(DEVICES)
        is_evol = random.random() < EVOL_PROBABILITY
        
        if is_evol:
            # --- 20% PATH: EVOL-INSTRUCT CHALLENGE ---
            metric = random.choice(list(METRIC_CAUSE_MAP.keys())).split(" ")[0]
            api = random.choice(OBSCURE_WEB_APIS)
            
            dynamic_prompt = (
                f"Invent a highly obscure, enterprise-level web performance bug for an application built in {fwork}.\n"
                f"CONSTRAINTS (MUST OBEY ALL):\n"
                f"1. The failing metric is {metric} running on: {device}.\n"
                f"2. The bottleneck MUST be caused by the misuse, race condition, or edge-case physics of: '{api}'.\n"
                f"3. You MUST invent a realistic anomaly where Swetrix shows the 99th-percentile users failing catastrophically, while the 75th-percentile passes perfectly. Lighthouse (Lab data) must completely miss the bug.\n"
                f"4. Map this to a real Lighthouse Audit ID that corresponds to the category of failure.\n"
                f"5. YOU ARE STRICTLY FORBIDDEN from using any of these basic causes: {', '.join(BANNED_CAUSES)}.\n\n"
                f"Your <think> block must explain the underlying browser engine physics (e.g., why this specific Web API broke the {metric} metric) and justify the fix using the RAIL model."
            )
            temp = 0.9 
            
        else:
            # --- 80% PATH: OMNI-MATRIX MAPPING ---
            comp = random.choice(COMPONENTS)
            metric_category = random.choice(list(METRIC_CAUSE_MAP.keys()))
            mapped_data = random.choice(METRIC_CAUSE_MAP[metric_category])
            
            dynamic_prompt = (
                f"Generate a complex performance issue for a '{comp}' built using '{fwork}'.\n"
                f"ENVIRONMENT: {device}\n"
                f"METRIC: {metric_category} (Audit ID: '{mapped_data['audit']}')\n"
                f"RUM DISCREPANCY: {mapped_data['rum_discrepancy']}\n"
                f"ROOT CAUSE: The underlying flaw MUST strictly be: '{mapped_data['cause']}' (Domain: {mapped_data['domain']}).\n"
            )
            temp = 0.7

        success = False
        retries = 0
        max_retries = 3

        while not success and retries < max_retries:
            # Execute Generation Loop
            try:
                response = client.chat.completions.create(
                    model="deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct",
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": dynamic_prompt}
                    ],
                    temperature=temp, 
                )
                
                # Use our new extractor instead of direct json.loads
                raw_content = response.choices[0].message.content
                if not raw_content:
                    retries += 1
                    continue

                teacher_output = extract_json(raw_content)
                
                sharegpt_format = {
                    "conversations": [
                        {"from": "user", "value": teacher_output["user_prompt"]},
                        {"from": "assistant", "value": teacher_output["assistant_response"]}
                    ]
                }
                
                f.write(json.dumps(sharegpt_format) + "\n")
                f.flush() 
                success = True # FIXED: Prevents redundant retries
                
            except Exception as e:
                retries += 1
                if retries < max_retries:
                    # Small backoff before trying again
                    time.sleep(1) 
                else:
                    print(f"❌ Failed iteration {i} after {max_retries} attempts: {e}")

print(f"✅ Final Dataset saved to {OUTPUT_FILE}")