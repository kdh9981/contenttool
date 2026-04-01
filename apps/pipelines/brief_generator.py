"""Content brief generator — uses Claude API to produce structured briefs from trend data."""

from __future__ import annotations

import json
import logging
from collections import Counter

import anthropic

from .config import AnthropicConfig
from .models import Job, VideoRecord

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a senior content strategist specializing in social media video content. "
    "Given platform trend data for a specific product category, produce a structured "
    "content brief that helps a marketing team decide what content to create next.\n\n"
    "Rules:\n"
    "- Be specific and data-driven. Reference actual video examples, concrete numbers, "
    "and engagement metrics from the data provided.\n"
    "- Tailor every recommendation to the target ICP (Ideal Customer Profile). "
    "Explain *why* a content angle resonates with that audience.\n"
    "- Factor in the target country/region — call out cultural nuances, local trends, "
    "language considerations, or platform usage patterns specific to that market.\n"
    "- When competitor accounts are provided, explicitly identify gaps and opportunities "
    "vs. their content strategy.\n"
    "- Prioritize actionable recommendations over generic best practices."
)

BRIEF_TEMPLATE = """\
Analyze the following trend data and produce a structured content brief.

## Job Context
- **Company:** {company_name}
- **Product:** {product_name}
- **Category:** {product_category}
- **Target ICP:** {target_icp}
- **Target Country:** {target_country}
- **Competitor Accounts:** {competitor_accounts_text}
- **Analysis Period:** {period_start} to {period_end}
- **Platform:** {platform}

## Top Performing Videos (ranked by engagement score)
{top_videos_text}

## Aggregate Stats
- Average views: {avg_views:.0f}
- Average likes: {avg_likes:.0f}
- Average comments: {avg_comments:.0f}
- Average shares: {avg_shares:.0f}
- Total videos analyzed: {total_videos}

## Top Hashtags (by frequency)
{top_hashtags_text}

## Content Format Distribution
{format_distribution_text}

---

Produce the brief in EXACTLY this format (markdown). Every bullet must reference \
specific data points from the analysis above. Do not use generic advice.

## Content Brief — {product_name} on {platform_title}
**Period:** {period_start} to {period_end}
**Target ICP:** {target_icp}
**Target Country:** {target_country}

### What's Trending
- Top 5 performing videos with why they resonated (reference engagement scores, \
hooks used in first 3 seconds, themes)
- Common themes, hooks, and visual styles — cite specific examples from the data
- Most-used hashtags in the category (list with frequency counts)

### What's Working
- Content formats driving highest engagement — reference the format distribution data
- Optimal video duration range based on top performers
- Audio/music trends (if applicable, especially for TikTok)
- Posting frequency and timing patterns of top performers

### Competitor Gaps & Opportunities
- What competitor accounts are doing well (if competitor data available)
- Content angles or formats competitors are NOT covering — these are opportunities
- Underserved audience segments within the {target_icp} that competitors miss

### Recommended Content Direction
- 2-3 specific content concepts for {product_name} targeting {target_icp} in {target_country}
- For each concept: suggested format, duration, hook, hashtags, and why it fits this ICP
- Cultural or regional considerations specific to {target_country}
- Suggested posting cadence
"""


def _engagement_score(record: VideoRecord) -> float:
    """PRD §5.5 weighted engagement score."""
    return (
        record.like_count * 1
        + record.comment_count * 2
        + record.share_count * 3
        + record.view_count / 1000
    )


def _build_top_videos_text(ranked: list[tuple[VideoRecord, float]], limit: int = 10) -> str:
    lines = []
    for i, (rec, score) in enumerate(ranked[:limit], 1):
        caption_preview = (rec.caption or "")[:120]
        if len(rec.caption or "") > 120:
            caption_preview += "..."
        duration_str = f"{rec.duration_seconds}s" if rec.duration_seconds else "n/a"
        tags = ", ".join(f"#{t}" for t in rec.hashtags[:5]) if rec.hashtags else "none"
        creator = rec.creator_username or "unknown"
        follower_info = f" ({rec.creator_follower_count:,} followers)" if rec.creator_follower_count else ""
        lines.append(
            f"{i}. **{creator}**{follower_info}\n"
            f"   Score: {score:.0f} | Views: {rec.view_count:,} | "
            f"Likes: {rec.like_count:,} | Comments: {rec.comment_count:,} | "
            f"Shares: {rec.share_count:,} | Duration: {duration_str}\n"
            f"   Hashtags: {tags}\n"
            f"   URL: {rec.video_url}\n"
            f"   Caption: {caption_preview}"
        )
    return "\n".join(lines) if lines else "(no videos extracted)"


def _build_hashtag_text(records: list[VideoRecord], limit: int = 15) -> str:
    counter: Counter[str] = Counter()
    for r in records:
        for tag in r.hashtags:
            counter[tag.lower().strip("#")] += 1
    if not counter:
        return "(no hashtags found)"
    return ", ".join(f"#{tag} ({count})" for tag, count in counter.most_common(limit))


def _build_format_distribution(records: list[VideoRecord]) -> str:
    counter: Counter[str] = Counter()
    for r in records:
        counter[r.media_type or "unknown"] += 1
    if not counter:
        return "(no format data)"
    total = sum(counter.values())
    return "\n".join(
        f"- {fmt}: {count} ({count / total * 100:.0f}%)"
        for fmt, count in counter.most_common()
    )


def prepare_platform_summary(
    job: Job, platform: str, records: list[VideoRecord]
) -> dict:
    """Aggregate records into a summary dict for prompt construction."""
    scored = [(r, _engagement_score(r)) for r in records]
    scored.sort(key=lambda x: x[1], reverse=True)

    n = max(len(records), 1)
    avg_likes = sum(r.like_count for r in records) / n
    avg_views = sum(r.view_count for r in records) / n
    avg_comments = sum(r.comment_count for r in records) / n
    avg_shares = sum(r.share_count for r in records) / n

    platform_titles = {
        "youtube": "YouTube",
        "tiktok": "TikTok",
        "instagram": "Instagram",
        "facebook": "Facebook",
    }

    competitor_text = (
        ", ".join(job.competitor_accounts)
        if job.competitor_accounts
        else "(none provided)"
    )

    return {
        "company_name": job.company_name,
        "product_name": job.product_name,
        "product_category": job.product_category,
        "target_icp": job.target_icp,
        "target_country": job.target_country,
        "competitor_accounts_text": competitor_text,
        "period_start": job.analysis_period_start,
        "period_end": job.analysis_period_end,
        "platform": platform,
        "platform_title": platform_titles.get(platform, platform.title()),
        "top_videos_text": _build_top_videos_text(scored),
        "avg_likes": avg_likes,
        "avg_views": avg_views,
        "avg_comments": avg_comments,
        "avg_shares": avg_shares,
        "total_videos": len(records),
        "top_hashtags_text": _build_hashtag_text(records),
        "format_distribution_text": _build_format_distribution(records),
        "ranked_records": scored,  # kept for DB storage
    }


async def generate_brief(
    config: AnthropicConfig,
    job: Job,
    platform: str,
    records: list[VideoRecord],
) -> str | None:
    """Call Claude API to generate a content brief for one platform's data.

    Returns the brief text, or None if generation fails.
    """
    if not config.api_key:
        logger.warning("ANTHROPIC_API_KEY not set — skipping brief generation")
        return None

    if not records:
        logger.info("No records for %s — skipping brief generation", platform)
        return None

    summary = prepare_platform_summary(job, platform, records)

    # Remove non-template keys before formatting
    template_vars = {k: v for k, v in summary.items() if k != "ranked_records"}
    user_prompt = BRIEF_TEMPLATE.format(**template_vars)

    client = anthropic.AsyncAnthropic(api_key=config.api_key)

    try:
        message = await client.messages.create(
            model=config.model,
            max_tokens=config.max_tokens,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        brief_text = message.content[0].text
        logger.info(
            "Generated content brief for %s (%d chars, %d input + %d output tokens)",
            platform,
            len(brief_text),
            message.usage.input_tokens,
            message.usage.output_tokens,
        )
        return brief_text
    except anthropic.APIError as e:
        logger.error("Claude API error for %s brief: %s", platform, e)
        return None
