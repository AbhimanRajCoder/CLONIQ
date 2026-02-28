# Structura Frontend – Process & Architecture

---

## 🏗 Project Structure

```
frontend/
├── package.json
├── tailwind.config.ts
├── next.config.js
├── electron/
│   └── main.js               # Electron main process & configuration
└── src/
    ├── app/
    │   ├── layout.tsx        # Global layout with Sidebar and Inter font
    │   ├── page.tsx          # Root redirect to Dashboard
    │   ├── globals.css       # Tailwind directives & glassmorphism utilities
    │   ├── dashboard/        # Dashboard with high-level stats overview
    │   ├── upload/           # Multi-file, ZIP, and GitHub upload interface
    │   ├── graph/            # Interactive Force-Directed Canvas Graph
    │   ├── heatmap/          # Similarity matrix heatmap visualization
    │   ├── clusters/         # Suspicious group identification display
    │   ├── ast-viewer/       # Interactive JSON tree representation of AST
    │   └── structure/        # Structural metrics analysis and counters
    ├── components/
    │   ├── Sidebar.tsx       # Collapsible navigation
    │   ├── Card.tsx          # Reusable glassmorphism card component
    │   ├── Button.tsx        # Styled gradient buttons with loading states
    │   ├── Modal.tsx         # Framer Motion animated overlay
    │   ├── StatsCard.tsx     # Animated count-up metric display
    │   ├── LoadingSpinner.tsx# Custom aesthetic loading animation
    │   ├── PageTransition.tsx# Fade/Slide routing animations
    │   └── CodeComparisonModal.tsx # Side-by-side syntax-highlighted code matching
    ├── services/
    │   └── api.ts            # Axios configuration & all backend API calls
    └── types/
        └── index.ts          # TypeScript interfaces mapping identically to backend schemas
```

---

## 💻 Tech Stack & Architecture

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (Strict mode enabled)
- **Styling**: Tailwind CSS (Dark theme native, `#0f172a` primary background)
- **Animations**: Framer Motion (Page transitions, micro-interactions, layout morphing)
- **Visualizations**: Native HTML5 Canvas (Similarity Graph) + DOM Grids (Heatmap)
- **Syntax Highlighting**: `react-syntax-highlighter`
- **Desktop Wrapper**: Electron (Standalone packaging, custom titlebars via `electron/main.js`)

---

## 🔄 Data Flow & State Management

1. **User Action:** User submits files, ZIPs, or GitHub URLs via the **Upload Page**.
2. **API Request:** `axios` intercepts the payload and sends multipart form-data to the FastAPI backend.
3. **Response Handling:** The frontend receives the heavily-typed backend payload (`AnalyzeResponse`, etc.) defined in `src/types/index.ts`.
4. **Result Storage:** Results are displayed in the UI instantly. Subsequent navigational state (like fetching graph edges or cluster analysis) executes standalone `GET` requests against the backend's recently cached analysis outputs.
5. **Visualization Generation:** Canvas API or standard DOM elements read the deeply-nested similarities to generate the force graphs and matrices dynamically.

---

## ✨ Core Features & Pages

### 1. Upload & Analyze (`/upload`)
- **Modes**: Python Files (multi-select), dual ZIP archives, or Two GitHub URLs.
- Lists the resulting suspicious pairs dynamically.
- Triggers the **CodeComparisonModal** when a pair is clicked.

### 2. Code Comparison Modal (`CodeComparisonModal.tsx`)
- Maps over the `matching_regions` array.
- Uses `react-syntax-highlighter` with the `atomOneDark` theme to render side-by-side matching source code.
- Focuses specifically on the parsed `lineno` boundaries retrieved from the AST.

### 3. Similarity Graph (`/graph`)
- Custom-built HTML5 Canvas Force-Directed algorithm.
- Adjusts edge thickness exactly to the `similarity_score`.
- Adds a severe red radial generic glow to nodes representing file similarities >= `70%`.

### 4. Heatmap (`/heatmap`)
- Draws a continuous 2D similarity matrix table.
- Converts numerical scores to gradient-mapped color fills (Blue/Purple for neutral similarity, Amber/Red for dangerous similarity).

### 5. Suspicious Clusters (`/clusters`)
- Breaks down tightly-coupled networks of structurally identical files.
- Summarizes the members inside of premium glassmorphism group cards.

### 6. AST Tree Viewer (`/ast-viewer`)
- Recursively converts Python AST outputs into a deep collapsible DOM tree.
- Applies strict color-coding standardizing Python nodes (e.g., `FunctionDef` is Cyan, `Module` is Purple).

### 7. Structure Summary (`/structure`)
- Upload a single `.py` file for architectural inspection.
- Drives Count-Up stat cards tracking AST Depth, Loops, If-statements, and generic Cyclomatic Complexity.

---

## 🎨 Design System

All components utilize a shared aesthetic standard driven heavily by global CSS and Tailwind macros.
- **Glassmorphism:** `.glass` global utility provides variable background blur `rgba(30, 41, 59, 0.6) backdrop-filter: blur(16px)`.
- **Accents:** A smooth gradient scale running from `purple-500` -> `cyan-500` used heavily on active tabs, charts, and loading spinners.
- **Typography:** `Inter` typeface standardizing strict and clean data legibility.

---

## 🛠 Setup & Run Instructions

```bash
# Navigate to the frontend directory
cd frontend

# Install all node dependencies
npm install

# Option A: Run Next.js Web Client (Development)
npm run dev
# The website runs at http://localhost:3000

# Option B: Run the Electron Desktop App wrapper
# Important: ensure the Next.js dev server is running on port 3000 in another tab
npm run electron

# Option C: Concurrent Run (Runs NextJS and Electron side-by-side)
npm run electron-dev

# Option D: Production Build
npm run build
```
