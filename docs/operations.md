# ATQA Operations Guide

## Overview

ATQA (Autonomous TTS Quality Assurance Agent) is a Next.js application that reviews TTS audio pronunciation using Cloud Speech-to-Text and Vertex AI Gemini.

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | `my-atqa-project` |
| `GOOGLE_CLOUD_LOCATION` | GCP region for AI services | `us-central1` |
| `GEMINI_MODEL` | Gemini model name | `gemini-2.0-flash` |
| `ALLOWED_AUDIO_HOSTS` | Comma-separated allowed CDN hosts | `cdn.convly.jp` |
| `ASR_CONFIDENCE_THRESHOLD` | Minimum STT confidence (0-1) | `0.75` |

## Local Development Setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- Google Cloud SDK with ADC configured

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Application Default Credentials

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

### 3. Enable Required Google APIs

```bash
gcloud services enable speech.googleapis.com
gcloud services enable aiplatform.googleapis.com
```

### 4. Set Environment Variables

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=us-central1
export GEMINI_MODEL=gemini-2.0-flash
export ALLOWED_AUDIO_HOSTS=cdn.convly.jp
export ASR_CONFIDENCE_THRESHOLD=0.75
```

### 5. Run Development Server

```bash
pnpm dev
```

Access at http://localhost:3000

## Testing

### Unit and Integration Tests

```bash
pnpm test
```

### E2E Tests

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

### Type Check

```bash
pnpm typecheck
```

### Lint

```bash
pnpm lint
```

## Cloud Run Deployment

### Build and Push Container

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/atqa
```

### Deploy to Cloud Run

```bash
gcloud run deploy atqa \
  --image gcr.io/PROJECT_ID/atqa \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=PROJECT_ID,GOOGLE_CLOUD_LOCATION=us-central1,GEMINI_MODEL=gemini-2.0-flash,ALLOWED_AUDIO_HOSTS=cdn.convly.jp,ASR_CONFIDENCE_THRESHOLD=0.75" \
  --memory 2Gi \
  --timeout 300
```

### Service Account Requirements

The Cloud Run service account needs:
- `roles/speech.client` - Cloud Speech-to-Text
- `roles/aiplatform.user` - Vertex AI

## Retry Behavior

- **STT failures**: Return `inconclusive`, no automatic retry
- **Gemini invalid output**: One automatic retry, then `inconclusive`
- **Audio fetch failures**: Return `inconclusive` with `AUDIO_FETCH_FAILED`
- **Idempotency**: In-memory deduplication per Cloud Run instance

## Data Retention

- **No persistence**: All review state is session-only (browser memory)
- **No logging of audio content**: Audio is processed in-memory and discarded
- **No credential exposure**: Raw errors are converted to safe messages

## Environment Checks

Before production use, verify:

1. **APIs enabled**: Speech-to-Text V2 and Vertex AI are active
2. **Credentials valid**: ADC can access both services
3. **Model available**: `GEMINI_MODEL` exists in `GOOGLE_CLOUD_LOCATION`
4. **CDN accessible**: `ALLOWED_AUDIO_HOSTS` returns valid audio

## Troubleshooting

### STT returns low confidence

- Check audio quality and format (MP3 expected)
- Verify `ASR_CONFIDENCE_THRESHOLD` is appropriate
- Background noise or overlapping speech reduces confidence

### Gemini returns inconclusive

- Model may lack evidence for a definitive judgment
- Check STT transcript quality
- Verify expected reading is correct

### Audio fetch fails

- Verify URL is HTTPS and host is in `ALLOWED_AUDIO_HOSTS`
- Check CDN availability
- Redirects to non-allowed hosts are blocked (SSRF protection)
