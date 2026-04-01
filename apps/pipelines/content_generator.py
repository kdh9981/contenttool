"""AI content generation — produces copy, images, and video stubs from content briefs.

Flow: trend_analysis (with content_brief) → generate assets → bundle into content_package.
"""

from __future__ import annotations

import logging
from typing import Any

import anthropic

from .config import PipelineConfig, AnthropicConfig
from .models import Job

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Copy generation (Claude API)
# ---------------------------------------------------------------------------

COPY_SYSTEM_PROMPT = (
    "You are a senior social media copywriter. Given a content brief and context "
    "about a product, create platform-optimized marketing copy. Be specific, "
    "reference the product by name, and tailor tone to the target audience."
)

COPY_USER_TEMPLATE = """\
Generate marketing copy for the following context:

## Product
- **Company:** {company_name}
- **Product:** {product_name}
- **Category:** {product_category}
- **Target ICP:** {target_icp}
- **Target Country:** {target_country}
- **Platform:** {platform}

## Content Brief
{content_brief}

---

Produce the following assets in JSON format (respond with ONLY the JSON, no markdown fencing):

{{
  "social_captions": [
    // 3 caption variants optimized for {platform}. Include relevant hashtags.
  ],
  "ad_copy": [
    // 2 ad copy variants (headline + body). Short, punchy, CTA-focused.
  ],
  "video_scripts": [
    {{
      "hook": "// first 3 seconds — attention-grabbing opener",
      "body": "// 10-20 second middle section",
      "cta": "// closing call-to-action",
      "duration_seconds": 15
    }}
    // 1 short-form video script
  ]
}}
"""


async def generate_copy(
    anthropic_config: AnthropicConfig,
    job: Job,
    platform: str,
    content_brief: str,
) -> dict | None:
    """Generate social copy, ad copy, and video scripts from a content brief."""
    if not anthropic_config.api_key:
        logger.warning("ANTHROPIC_API_KEY not set — skipping copy generation")
        return None

    if not content_brief:
        logger.info("No content brief for %s — skipping copy generation", platform)
        return None

    prompt = COPY_USER_TEMPLATE.format(
        company_name=job.company_name,
        product_name=job.product_name,
        product_category=job.product_category,
        target_icp=job.target_icp,
        target_country=job.target_country,
        platform=platform,
        content_brief=content_brief,
    )

    client = anthropic.AsyncAnthropic(api_key=anthropic_config.api_key)

    try:
        message = await client.messages.create(
            model=anthropic_config.model,
            max_tokens=2048,
            system=COPY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text

        # Parse JSON response — Claude may wrap in backticks
        import json
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0]

        copy_data = json.loads(cleaned)
        logger.info(
            "Generated copy for %s (%d input + %d output tokens)",
            platform,
            message.usage.input_tokens,
            message.usage.output_tokens,
        )
        return copy_data

    except (anthropic.APIError, json.JSONDecodeError) as e:
        logger.error("Copy generation failed for %s: %s", platform, e)
        return None


# ---------------------------------------------------------------------------
# Image generation (OpenAI DALL-E API)
# ---------------------------------------------------------------------------

async def generate_images(
    config: PipelineConfig,
    job: Job,
    platform: str,
    content_brief: str,
    count: int = 2,
) -> list[str]:
    """Generate images using OpenAI DALL-E API.

    Returns a list of image URLs. Empty list on failure or missing API key.
    """
    api_key = config.openai_api_key
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — skipping image generation")
        return []

    if not content_brief:
        return []

    # Build a focused image prompt from the brief
    image_prompt = (
        f"Professional marketing image for {job.product_name} by {job.company_name}. "
        f"Category: {job.product_category}. Target audience: {job.target_icp} in {job.target_country}. "
        f"Platform: {platform}. Style: modern, clean, brand-safe. "
        f"Based on trending content themes from the content brief."
    )

    import aiohttp

    url = "https://api.openai.com/v1/images/generations"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "dall-e-3",
        "prompt": image_prompt,
        "n": 1,  # DALL-E 3 only supports n=1
        "size": "1024x1024",
        "quality": "standard",
    }

    image_urls: list[str] = []

    async with aiohttp.ClientSession() as session:
        for i in range(count):
            try:
                async with session.post(url, headers=headers, json=payload) as resp:
                    if resp.status != 200:
                        error_body = await resp.text()
                        logger.error("DALL-E API error (attempt %d): %s", i + 1, error_body)
                        continue
                    data = await resp.json()
                    img_url = data["data"][0]["url"]
                    image_urls.append(img_url)
                    logger.info("Generated image %d/%d for %s", i + 1, count, platform)
            except Exception as e:
                logger.error("Image generation error (attempt %d): %s", i + 1, e)

    return image_urls


# ---------------------------------------------------------------------------
# Video generation (stub for MVP)
# ---------------------------------------------------------------------------

async def generate_video(
    config: PipelineConfig,
    job: Job,
    platform: str,
    content_brief: str,
) -> dict | None:
    """Stub for video generation — returns metadata placeholder.

    Full integration with Runway ML / Kling planned for post-MVP.
    """
    logger.info("Video generation is stubbed for MVP — returning placeholder for %s", platform)
    return {
        "status": "stub",
        "message": "Video generation not yet integrated. Planned: Runway ML / Kling API.",
        "platform": platform,
    }


# ---------------------------------------------------------------------------
# Asset bundling — combines all generated assets into a content package
# ---------------------------------------------------------------------------

async def generate_content_package(
    config: PipelineConfig,
    job: Job,
    platform: str,
    content_brief: str,
    analysis_id: str | None = None,
) -> dict[str, Any]:
    """Generate all content assets and bundle them into a content package payload.

    Returns the content_body dict ready for insertion into content_packages table.
    """
    # Generate all assets concurrently
    import asyncio

    copy_task = generate_copy(config.anthropic, job, platform, content_brief)
    image_task = generate_images(config, job, platform, content_brief)
    video_task = generate_video(config, job, platform, content_brief)

    copy_data, image_urls, video_data = await asyncio.gather(
        copy_task, image_task, video_task
    )

    content_body: dict[str, Any] = {
        "brief_text": content_brief,
        "analysis_id": analysis_id,
        "platform": platform,
        "copy": copy_data,
        "image_urls": image_urls,
        "video": video_data,
        "generation_params": {
            "company_name": job.company_name,
            "product_name": job.product_name,
            "product_category": job.product_category,
            "target_icp": job.target_icp,
            "target_country": job.target_country,
        },
    }

    return content_body
