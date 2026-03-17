const API = '';  // same origin
const LIMIT = 18;

let state = {
  stories: [],
  total: 0,
  page: 1,
  source: 'all',
  search: '',
  sort: 'newest',
  sources: [],
  lastFetched: null
};

// --- Helpers ---
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function storyEmoji(title) {
  const t = title.toLowerCase();
  if (t.includes('robot') || t.includes('autonom')) return '🤖';
  if (t.includes('image') || t.includes('vision') || t.includes('video')) return '🎨';
  if (t.includes('safety') || t.includes('align') || t.includes('risk')) return '🛡️';
  if (t.includes('chip') || t.includes('hardware') || t.includes('gpu')) return '💻';
  if (t.includes('open') || t.includes('open-source')) return '🔓';
  if (t.includes('research') || t.includes('paper') || t.includes('study')) return '📊';
  if (t.includes('startup') || t.includes('fund') || t.includes('invest') || t.includes('billion')) return '💰';
  if (t.includes('health') || t.includes('medical') || t.includes('drug')) return '🏥';
  if (t.includes('law') || t.includes('regul') || t.includes('ban') || t.includes('policy')) return '⚖️';
  return '🧠';
}

// --- Render ---
function renderCard(story) {
  const a = document.createElement('a');
  a.className = 'story-card';
  a.href = story.link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const imgSection = story.image
    ? `<div class="story-card-img"><img src="${story.image}" alt="" loading="lazy" onerror="this.parentElement.outerHTML='<div class=\\"story-card-img-placeholder\\">${storyEmoji(story.title)}</div>'" /></div>`
    : `<div class="story-card-img-placeholder">${storyEmoji(story.title)}</div>`;

  a.innerHTML = `
    ${imgSection}
    <div class="story-card-body">
      <div class="story-source-row">
        <div class="story-source">
          <span class="story-source-dot" style="background:${story.sourceColor}"></span>
          <span style="color:${story.sourceColor}">${story.source}</span>
        </div>
        <span class="story-time">${timeAgo(story.published)}</span>
      </div>
      <div class="story-title">${story.title}</div>
      ${story.snippet ? `<div class="story-snippet">${story.snippet}</div>` : ''}
      <div class="story-footer"><span class="story-read-more">Read more →</span></div>
    </div>
  `;
  return a;
}

function renderStories(stories) {
  const grid = document.getElementById('storiesGrid');
  grid.innerHTML = '';
  if (stories.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:#5f6368">No stories found. Try a different filter.</div>';
  } else {
    stories.forEach(s => grid.appendChild(renderCard(s)));
  }
}

function renderSources(sources) {
  const list = document.getElementById('sourceList');
  // keep "All Sources" button
  const allBtn = list.querySelector('[data-source="all"]');
  list.innerHTML = '';
  list.appendChild(allBtn);
  sources.forEach(src => {
    const btn = document.createElement('button');
    btn.className = 'source-btn';
    btn.dataset.source = src.name;
    btn.innerHTML = `<span class="source-dot" style="background:${src.color}"></span>${src.name}`;
    btn.addEventListener('click', () => setSource(src.name));
    list.appendChild(btn);
  });
}

function renderTopics(stories) {
  const counts = {};
  const topics = ['ChatGPT','Claude','Gemini','OpenAI','Anthropic','LLM','Agents','Safety',
                  'GPT-4','Mistral','Llama','Robotics','Chips','Regulation','Research',
                  'DeepMind','Grok','Copilot','Vision','Healthcare'];
  topics.forEach(t => {
    const cnt = stories.filter(s => s.title.toLowerCase().includes(t.toLowerCase())).length;
    if (cnt > 0) counts[t] = cnt;
  });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 12);
  const el = document.getElementById('topicsList');
  el.innerHTML = sorted.map(([t]) =>
    `<span class="topic-chip" data-topic="${t}">${t}</span>`
  ).join('');
  el.querySelectorAll('.topic-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('searchInput').value = chip.dataset.topic;
      state.search = chip.dataset.topic;
      state.page = 1;
      loadStories();
    });
  });
}

function updateStats() {
  document.getElementById('totalCount').textContent = state.total;
  if (state.lastFetched) {
    const d = new Date(state.lastFetched);
    document.getElementById('lastUpdated').textContent = timeAgo(d.toISOString());
  }
}

function updatePagination() {
  const totalPages = Math.ceil(state.total / LIMIT);
  const pag = document.getElementById('pagination');
  if (totalPages <= 1) { pag.style.display = 'none'; return; }
  pag.style.display = 'flex';
  document.getElementById('pageInfo').textContent = `Page ${state.page} of ${totalPages}`;
  document.getElementById('prevPage').disabled = state.page <= 1;
  document.getElementById('nextPage').disabled = state.page >= totalPages;
}

function updateActiveSource() {
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.source === state.source);
  });
}

// --- Data ---
async function loadStories() {
  const grid = document.getElementById('storiesGrid');
  const loading = document.getElementById('loadingState');
  const error = document.getElementById('errorState');
  const pag = document.getElementById('pagination');
  const info = document.getElementById('resultsInfo');

  grid.style.display = 'none';
  error.style.display = 'none';
  loading.style.display = 'flex';
  pag.style.display = 'none';

  const params = new URLSearchParams({
    page: state.page,
    limit: LIMIT,
    source: state.source,
    search: state.search
  });

  try {
    const res = await fetch(`${API}/api/stories?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.total = data.total;
    state.lastFetched = data.lastFetched;

    let stories = data.stories;
    if (state.sort === 'source') {
      stories = [...stories].sort((a,b) => a.source.localeCompare(b.source));
    }

    if (state.sources.length === 0 && data.sources) {
      state.sources = data.sources;
      renderSources(data.sources);
    }

    loading.style.display = 'none';
    grid.style.display = 'grid';

    renderStories(stories);
    updatePagination();
    updateStats();
    updateActiveSource();

    const searchStr = state.search ? ` for "${state.search}"` : '';
    const srcStr = state.source !== 'all' ? ` from ${state.source}` : '';
    info.textContent = `${data.total} AI stories${srcStr}${searchStr}`;

    // Render topics from all stories for sidebar
    if (state.page === 1 && !state.search) {
      renderTopics(stories);
    }

  } catch (err) {
    console.error(err);
    loading.style.display = 'none';
    error.style.display = 'flex';
  }
}

async function refreshStories() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  try {
    await fetch(`${API}/api/refresh`, { method: 'POST' });
    state.page = 1;
    await loadStories();
  } finally {
    btn.classList.remove('spinning');
  }
}

// --- Event wiring ---
function setSource(src) {
  state.source = src;
  state.page = 1;
  updateActiveSource();
  loadStories();
}

document.getElementById('refreshBtn').addEventListener('click', refreshStories);

document.getElementById('sourceList').addEventListener('click', e => {
  const btn = e.target.closest('.source-btn');
  if (btn) setSource(btn.dataset.source);
});

let searchTimer;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    state.page = 1;
    loadStories();
  }, 400);
});

document.getElementById('sortSelect').addEventListener('change', e => {
  state.sort = e.target.value;
  loadStories();
});

document.getElementById('prevPage').addEventListener('click', () => {
  if (state.page > 1) { state.page--; loadStories(); window.scrollTo(0,0); }
});
document.getElementById('nextPage').addEventListener('click', () => {
  state.page++;
  loadStories();
  window.scrollTo(0, 0);
});

// --- Init ---
loadStories();
