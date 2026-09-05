# 🚀 YouTube Script PDF & Channel Growth Research Studio

[![Live Demo](https://img.shields.io/badge/Live_Demo-https%3A%2F%2Fyoutube--script--pdf--generator.onrender.com-brightgreen?style=for-the-badge&logo=render)](https://youtube-script-pdf-generator.onrender.com/)
![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg?style=flat-square&logo=node.js)
![Express](https://img.shields.io/badge/Express-5.x-blue.svg?style=flat-square&logo=express)
![Pollinations.ai](https://img.shields.io/badge/AI_Text-Pollinations.ai-38B2AC.svg?style=flat-square)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.x-38B2AC.svg?style=flat-square&logo=tailwind-css)
![License](https://img.shields.io/badge/License-MIT-orange.svg?style=flat-square)

> 🌐 **Live Web Demo:** [https://youtube-script-pdf-generator.onrender.com/](https://youtube-script-pdf-generator.onrender.com/)

> **Full-Stack Web Application for YouTube Channel Script PDF Extraction & Competitor Growth Research using Pollinations.ai Cloud Text API.**

---

## 🌟 Overview

The **YouTube Script PDF & Channel Growth Research Studio** provides two powerful workflows for content creators and researchers:

1. 📕 **Script PDF Downloader**: Extract complete video transcripts & metadata from any YouTube channel and compile them into a styled PDF E-Book with Table of Contents and Devanagari Hindi font support.
2. 🚀 **Channel Growth Research Mode (Pollinations AI)**:
   - **Competitor Top-Performer Finder**: Rank channel videos using a composite view-retention & engagement score.
   - **Hook Extractor**: Isolate the first 15–30 seconds of transcript text across top videos.
   - **Cloud AI New Script Generator**: Use Pollinations.ai free cloud text API to write 20 original, non-paraphrased video scripts on competitor topics with strict copyright guardrails.
   - **Title Generator**: Produce 5–10 catchy high-CTR title suggestions per new script.
   - **Niche Trend & Duration Analysis**: Extract trending niche keywords and identify the optimal video duration category.

---

## ✨ Key Features

- 🎯 **Universal Channel Extraction**: Extract transcripts & metadata from any YouTube Channel URL or handle (`@channelname`).
- ⚡ **Zero-Setup Cloud AI Generation**: Powered by Pollinations.ai free cloud text API — no local LLM installation, setup, or API keys required.
- 🛡️ **Copyright Guardrails**: Explicit AI prompts enforce 100% fresh script structure, unique hook, and new examples without copying source text.
- 🇮🇳 **Flawless Hindi & Devanagari Font Support**: Uses Noto Sans Devanagari & Mangal font fallbacks to render Hindi text accurately in PDFs.
- ⚡ **Real-Time SSE Progress Stream**: Live progress bar (0%–100%) and streaming console logs.
- 🎨 **Dark-Mode Glassmorphism UI**: Built with Tailwind CSS and responsive design.

---

## 🔄 System Architecture & Workflow

```mermaid
flowchart TD
    A[User Selects Mode & Submits Channel Handle] -->|POST /api/extract OR /api/analyze-competitor| B[Express Backend Server]
    B -->|Initialize Job| C[Server-Sent Events SSE Stream]
    C -->|Real-time Logs & Progress| UI[Web Frontend UI]
    
    subgraph Mode 1: Script E-Book
        B --> D[yt-dlp Scrape Video List]
        D --> E[youtube-transcript Subtitle Extraction]
        E --> F[Generate HTML E-Book & PDF via Edge Headless]
    end

    subgraph Mode 2: Channel Growth Research
        B --> H[yt-dlp Scrape Competitor Videos & Metadata]
        H --> I[Rank Top 20 Videos by Composite Retention Score]
        I --> J[Extract Transcripts & Opening 15-30s Hooks]
        J --> K[Pollinations.ai Text API: Generate 20 Original Scripts & Titles]
        K --> L[Extract Trending Keywords & Video Length Patterns]
        L --> M[Generate Styled Growth Research PDF Report]
    end

    F --> N[Serve Downloadable PDF]
    M --> N
```

---

## 📁 Project Directory Structure

```text
YouTube-Script-PDF-Generator/
├── lib/
│   ├── text_generator.js       # Pollinations.ai free cloud text API wrapper
│   ├── competitor_analyzer.js   # Scoring, hook extraction & niche keyword trends
│   └── competitor_report_pdf.js# PDF report HTML renderer
├── public/
│   └── index.html              # Dual-Mode Web UI (Tailwind CSS, Glassmorphism)
├── server.js                   # Express Backend Server & API routes
├── yt-dlp.exe                  # YouTube video metadata scraper
├── package.json                # Dependencies & scripts
└── README.md                   # Complete Documentation
```

---

## 🛠️ Local Setup

### 1. Install & Start Server

```bash
git clone https://github.com/sonuukush/YouTube-Script-PDF-Generator.git
cd YouTube-Script-PDF-Generator
npm install
npm start
```

### 2. Open in Browser

👉 **`http://localhost:3000`**

---

## 🌐 Live Web Demo

Try the application live without local installation:  
👉 **[https://youtube-script-pdf-generator.onrender.com/](https://youtube-script-pdf-generator.onrender.com/)**

---

<p align="center">Made with ❤️ for Content Creators, Researchers & Developers</p>
