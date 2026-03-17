const express = require('express');
const Parser = require('rss-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const parser = new Parser({
  customFields: {
    item: ['media:content', 'media:thumbnail', 'enclosure']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// AI news RSS feeds (sources that frequently appear in Google Discover)
const AI_FEEDS = [
  {
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    color: '#0a8217'
  },
  {
    name: 'VentureBeat AI',
    url: 'https://venturebeat.com/category/ai/feed/',
    color: '#e8372c'
  },
  {
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    color: '#990000'
  },
  {
    name: 'The Verge AI',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    color: '#fa4b2a'
  },
  {
    name: 'Wired AI',
    url: 'https://www.wired.com/feed/tag/artificial-intelligence/latest/rss',
    color: '#000000'
  },
  {
    name: 'Ars Technica AI',
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
    color: '#ff4e00'
  },
  {
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/rss/',
    color: '#4285f4'
  },
  {
    name: 'OpenAI News',
    url: 'https://openai.com/news/rss.xml',
    color: '#10a37f'
  },
  {
    name: 'DeepMind Blog',
    url: 'https://deepmind.google/blog/rss.xml',
    color: '#1a73e8'
  },
  {
    name: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog/feed.xml',
    color: '#ff9d00'
  }
];

// AI-related keywords for filtering
const AI_KEYWORDS = [
  'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
  'large language model', 'llm', 'generative ai', 'chatgpt', 'gpt', 'claude',
  'gemini', 'openai', 'anthropic', 'deepmind', 'ai model', 'transformer',
  'diffusion model', 'stable diffusion', 'midjourney', 'dall-e', 'copilot',
  'autonomous', 'robotics', 'natural language', 'computer vision', 'agi',
  'reinforcement learning', 'fine-tuning', 'prompt engineering', 'hallucination',
  'foundation model', 'multimodal', 'ai safety', 'alignment', 'inference',
  'hugging face', 'mistral', 'llama', 'perplexity', 'ai chip', 'nvidia ai',
  'ai agent', 'agentic', 'reasoning model', 'o1', 'o3', 'grok', 'xai'
];

function isAIStory(item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''}`.toLowerCase();
  return AI_KEYWORDS.some(kw => text.includes(kw));
}

function extractImage(item) {
  if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
    return item['media:content'].$.url;
  }
  if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
    return item['media:thumbnail'].$.url;
  }
  if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
    return item.enclosure.url;
  }
  // Try to extract from content
  if (item.content) {
    const match = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match) return match[1];
  }
  return null;
}

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url);
    return result.items.slice(0, 20).map(item => ({
      id: item.guid || item.link,
      title: item.title,
      link: item.link,
      snippet: item.contentSnippet ? item.contentSnippet.slice(0, 200) : '',
      published: item.pubDate || item.isoDate,
      source: feed.name,
      sourceColor: feed.color,
      image: extractImage(item),
      categories: item.categories || []
    }));
  } catch (err) {
    console.error(`Failed to fetch ${feed.name}: ${err.message}`);
    return [];
  }
}

// In-memory cache
let cache = { stories: [], lastFetched: null };
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function refreshStories() {
  console.log('Fetching AI stories...');
  const results = await Promise.allSettled(AI_FEEDS.map(fetchFeed));
  let all = [];
  results.forEach(r => {
    if (r.status === 'fulfilled') all = all.concat(r.value);
  });

  // Filter to AI stories and deduplicate by title similarity
  const aiStories = all.filter(isAIStory);
  const seen = new Set();
  const deduped = aiStories.filter(s => {
    const key = s.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date (newest first)
  deduped.sort((a, b) => new Date(b.published) - new Date(a.published));

  cache = { stories: deduped, lastFetched: Date.now() };
  console.log(`Cached ${deduped.length} AI stories`);
  return deduped;
}

// API: Get stories
app.get('/api/stories', async (req, res) => {
  const { source, search, page = 1, limit = 20 } = req.query;

  // Refresh if stale
  if (!cache.lastFetched || Date.now() - cache.lastFetched > CACHE_TTL) {
    await refreshStories();
  }

  let stories = cache.stories;

  if (source && source !== 'all') {
    stories = stories.filter(s => s.source === source);
  }

  if (search) {
    const q = search.toLowerCase();
    stories = stories.filter(s =>
      s.title.toLowerCase().includes(q) || s.snippet.toLowerCase().includes(q)
    );
  }

  const start = (parseInt(page) - 1) * parseInt(limit);
  const paginated = stories.slice(start, start + parseInt(limit));

  res.json({
    total: stories.length,
    page: parseInt(page),
    limit: parseInt(limit),
    lastFetched: cache.lastFetched,
    sources: AI_FEEDS.map(f => ({ name: f.name, color: f.color })),
    stories: paginated
  });
});

// API: Force refresh
app.post('/api/refresh', async (req, res) => {
  cache.lastFetched = null;
  await refreshStories();
  res.json({ success: true, count: cache.stories.length, lastFetched: cache.lastFetched });
});

// API: Stats
app.get('/api/stats', async (req, res) => {
  if (!cache.lastFetched) await refreshStories();
  const bySource = {};
  cache.stories.forEach(s => {
    bySource[s.source] = (bySource[s.source] || 0) + 1;
  });
  res.json({
    total: cache.stories.length,
    bySource,
    lastFetched: cache.lastFetched
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Stories Tracker running on http://localhost:${PORT}`);
  refreshStories(); // initial fetch
});
