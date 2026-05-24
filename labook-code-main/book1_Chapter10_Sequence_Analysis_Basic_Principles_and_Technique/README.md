# FYP Ch10: Learning Session Sequence Studio

## Student attribution

| Role | Name | Roll No | Project title |
|---|---|---|---|
| **Primary** | HASAN MUSTAFA | `F22BINFT1M01247` | Sequence Analysis of Student Learning Paths in Online Courses |
| Secondary | ZABIHA ZAINAB | `F22BINFT1M01036` | Student Learning Pattern Analysis Using R-Based Learning Analytics Framework |

Section: Fall 2025 BSIT (7th semester) FYP cohort.


## Project Title

Learning Session Sequence Studio for Moodle Sequence Analysis

## Problem Statement

Raw Moodle logs show what students clicked, but they do not immediately show the shape of complete learning sessions. This project translates Chapter 10 into a Python-based FYP that sessionizes Moodle events, clusters session traces, and lets a user test a new sequence against the discovered session patterns.

## Core Idea

- Source concept: Chapter 10 sequence analysis and clustering.
- Source data: local copy of `Events.xlsx` from the Moodle course dataset.
- Python runtime: sessionization, sequence-table construction, one-hot sequence encoding, and cluster discovery.
- Frontend: a web dashboard with manual sequence input.

## Folder Guide

- `backend/`: reproducible Python pipeline.
- `data/raw/`: local dataset copy used by the package.
- `data/processed/`: sessionized event outputs.
- `outputs/backend/`: dashboard JSON and CSV artifacts.
- `frontend/`: web-based FYP interface.
- `run/`: launch scripts for backend, frontend, and notebook.

## Run Instructions

### Primary launcher

From PowerShell:

```powershell
.\run\run_project.ps1
```

This is the recommended one-step launcher. It refreshes backend artifacts, starts the project-local web server, and opens the dashboard automatically.

Optional switches: `-SkipBackend` uses the existing artifacts and `-NoBrowser` starts the local server without opening a browser window.

If students prefer a double-click launcher in File Explorer, use `run\run_project.bat`.

### Other launchers

- `run\run_backend.ps1` or `run\run_backend.bat`: regenerate backend artifacts only.
- `run\run_frontend.ps1` or `run\run_frontend.bat`: serve the frontend only.
- `run\run_notebook.ps1` or `run\run_notebook.bat`: open the notebook-equivalent workflow.