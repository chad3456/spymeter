/* ── SPYMETER — Geopolitical Prediction Polls ─────────────
   Users vote on geopolitical outcomes. Votes stored server-
   side (polls.json), per-user tracking via localStorage.    */
const POLLS = (() => {

  const POLL_COLORS = ['#00d4ff', '#ff9900', '#00ff88', '#aa44ff'];
  const VOTE_KEY    = 'spymeter_votes_v1';

  // ── LocalStorage helpers ─────────────────────────────
  function getUserVotes() {
    try { return JSON.parse(localStorage.getItem(VOTE_KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function saveUserVote(id, optionIndex) {
    const v = getUserVotes();
    v[id] = optionIndex;
    try { localStorage.setItem(VOTE_KEY, JSON.stringify(v)); } catch (_) {}
  }
  function userVoteFor(id) {
    return getUserVotes()[id]; // undefined = not voted
  }

  // ── Fetch all polls from server ─────────────────────
  async function fetchPolls() {
    try {
      const r = await window.fetch('/api/polls');
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (_) { return []; }
  }

  // ── Submit vote ─────────────────────────────────────
  async function submitVote(pollId, optionIndex) {
    try {
      const r = await window.fetch(`/api/polls/${pollId}/vote`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ option: optionIndex }),
      });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (_) { return null; }
  }

  // ── Render a single poll card ───────────────────────
  function renderPoll(poll, container) {
    const userVote   = userVoteFor(poll.id);
    const hasVoted   = userVote !== undefined;
    const totalVotes = poll.votes.reduce((s, v) => s + v, 0);

    const card = document.createElement('div');
    card.className = 'poll-card';
    card.id = `poll-${poll.id}`;

    const header = `
      <div class="poll-question">${poll.question}</div>
      <div class="poll-meta">${totalVotes.toLocaleString()} votes · ${hasVoted ? 'Voted ✓' : 'Click to vote'}</div>`;

    const optionsHTML = poll.options.map((opt, i) => {
      const votes = poll.votes[i] || 0;
      const pct   = totalVotes > 0 ? Math.round(votes / totalVotes * 100) : 0;
      const col   = POLL_COLORS[i % POLL_COLORS.length];
      const isUserChoice = hasVoted && userVote === i;
      const isLeading    = hasVoted && votes === Math.max(...poll.votes);
      return `
        <div class="poll-option ${hasVoted ? 'voted' : 'clickable'} ${isUserChoice ? 'my-vote' : ''}"
             data-poll="${poll.id}" data-opt="${i}">
          <div class="poll-opt-bar" style="width:${hasVoted ? pct : 0}%;background:${col}33;border-color:${col}"></div>
          <div class="poll-opt-content">
            <span class="poll-opt-label">${isUserChoice ? '▶ ' : ''}${opt}</span>
            <span class="poll-opt-pct" style="color:${col}">${hasVoted ? pct + '%' : ''}</span>
          </div>
        </div>`;
    }).join('');

    card.innerHTML = header + '<div class="poll-options">' + optionsHTML + '</div>';

    // Attach click handlers only if not yet voted
    if (!hasVoted) {
      card.querySelectorAll('.poll-option.clickable').forEach(el => {
        el.addEventListener('click', async () => {
          const id  = el.dataset.poll;
          const opt = parseInt(el.dataset.opt, 10);
          saveUserVote(id, opt);
          const updated = await submitVote(id, opt);
          // Re-render this card with updated data
          const idx = Array.from(container.children).indexOf(card);
          const newPoll = updated || poll;
          newPoll.votes[opt] = (newPoll.votes[opt] || 0) + (updated ? 0 : 1);
          const newCard = document.createElement('div');
          newCard.id = card.id;
          container.replaceChild(newCard, card);
          renderPoll(newPoll, container);
        });
      });
    }

    container.appendChild(card);
  }

  // ── Render RSS news ─────────────────────────────────
  async function loadRSSNews() {
    const el = document.getElementById('rss-feed');
    if (!el) return;
    el.innerHTML = '<div class="news-loading">⟳ Fetching live RSS feeds…</div>';
    try {
      const r = await window.fetch('/api/rss');
      const d = r.ok ? await r.json() : { articles: [] };
      const arts = d.articles || [];
      if (!arts.length) { el.innerHTML = '<div class="news-loading">RSS unavailable</div>'; return; }
      el.innerHTML = arts.map(a => {
        const dt = a.date ? (() => {
          try {
            const ms = Date.now() - new Date(a.date).getTime();
            const min = Math.round(ms / 60000);
            return min < 60 ? `${min}m ago` : `${Math.round(min/60)}h ago`;
          } catch (_) { return ''; }
        })() : '';
        return `
          <a class="news-item rss-item" href="${a.url}" target="_blank" rel="noopener noreferrer">
            <div class="news-title">${a.title}</div>
            <div class="news-meta">
              <span class="news-src rss-src">${a.source}</span>
              <span class="news-date">${dt}</span>
              <span class="badge-rss">RSS</span>
            </div>
          </a>`;
      }).join('');
    } catch (_) {
      el.innerHTML = '<div class="news-loading">RSS feed error</div>';
    }
  }

  // ── Main init ───────────────────────────────────────
  async function init() {
    const container = document.getElementById('polls-list');
    if (!container) return;
    container.innerHTML = '<div class="news-loading">⟳ Loading predictions…</div>';

    const polls = await fetchPolls();
    container.innerHTML = '';

    if (!polls.length) {
      container.innerHTML = '<div class="news-loading">Polls unavailable</div>';
      return;
    }

    polls.forEach(poll => renderPoll(poll, container));

    const ct = document.getElementById('polls-count');
    if (ct) ct.textContent = `${polls.length} questions · ${getUserVotes() ? Object.keys(getUserVotes()).length : 0} voted`;
  }

  // Refresh RSS every 90s, polls every 60s
  setInterval(loadRSSNews, 90_000);

  return { init, loadRSSNews };
})();
