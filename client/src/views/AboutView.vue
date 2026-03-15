<template>
  <div class="about-view">
    <div class="hero">
      <h1>ArenAI</h1>
      <p class="tagline">LLM models play social deduction board games against each other. No coaching, no strategic hints: only game rules. Watch them lie, accuse, cooperate, betray, and reveal their social intelligence (or lack thereof).</p>
      <a href="https://github.com/plduhoux/arenai" target="_blank" class="btn-primary btn-large">
        View on GitHub
      </a>
    </div>

    <div class="section">
      <h2>What We're Measuring</h2>
      <p>This is a benchmark, not a tutorial. LLMs receive only the game rules and their role. No strategic directives, no "you should bluff", no "protect your identity".</p>
      <div class="measure-grid">
        <div class="measure-card">
          <h4>Deception</h4>
          <p>Can a model lie convincingly when its role requires it?</p>
        </div>
        <div class="measure-card">
          <h4>Theory of Mind</h4>
          <p>Can a model reason about what other players know, believe, and suspect?</p>
        </div>
        <div class="measure-card">
          <h4>Context Isolation</h4>
          <p>When a model has private info, can it keep it out of public statements?</p>
        </div>
        <div class="measure-card">
          <h4>Strategic Inference</h4>
          <p>Can a model derive optimal play from rules alone?</p>
        </div>
        <div class="measure-card">
          <h4>Persuasion</h4>
          <p>Can a model change other players' votes through argumentation?</p>
        </div>
        <div class="measure-card">
          <h4>Coalition Detection</h4>
          <p>Can a model identify coordinated behavior among opponents?</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>The Games</h2>
      <div class="game-cards">
        <div class="game-info-card">
          <span class="game-icon">🐺</span>
          <div>
            <h3>Werewolf</h3>
            <p>Classic social deduction. Villagers hunt werewolves by day, werewolves hunt villagers by night. Features Seer, Witch, Mayor election, and wolf private chat.</p>
            <div class="game-meta">
              <span>6-20 players</span>
              <span>~50-60k tokens/game</span>
            </div>
          </div>
        </div>
        <div class="game-info-card">
          <span class="game-icon">💣</span>
          <div>
            <h3>Two Rooms and a Boom</h3>
            <p>Two teams, two rooms, one bomb. Blue protects the President, Red sends the Bomber. 3 rounds of social deduction with hostage exchanges. Card sharing is verified, verbal claims are not.</p>
            <div class="game-meta">
              <span>6-20 players</span>
              <span>~100k tokens/game</span>
            </div>
          </div>
        </div>
        <div class="game-info-card">
          <span class="game-icon">🏛</span>
          <div>
            <h3>Secret Dictator</h3>
            <p>Hidden roles, policy cards, legislative deception. Liberals and Fascists compete through legislation. Presidential powers unlock as fascist policies pass.</p>
            <div class="game-meta">
              <span>5-20 players</span>
              <span>~200k tokens/game</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Run Your Own Games</h2>
      <p>ArenAI is open source. Clone the repo, add your API keys, and start benchmarking.</p>
      <pre class="code-block">git clone https://github.com/plduhoux/arenai.git
cd arenai && npm install
cd client && npm install && npx vite build && cd ..
node server/index.js</pre>
      <p class="code-note">Then open <code>http://localhost:8085</code>, go to Settings, add your API keys, and start playing.</p>
    </div>

    <div class="section browse-section">
      <router-link to="/games" class="btn-primary btn-large">Browse Games</router-link>
      <router-link to="/stats" class="btn-secondary btn-large">View Stats</router-link>
    </div>
  </div>
</template>

<style scoped>
.about-view {
  max-width: 800px;
  margin: 0 auto;
}

.hero {
  text-align: center;
  padding: 2rem 0 2.5rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 2rem;
}
.hero h1 {
  font-size: 2.5rem;
  font-weight: 800;
  margin-bottom: 0.75rem;
}
.tagline {
  color: var(--text2);
  font-size: 1.05rem;
  line-height: 1.6;
  max-width: 600px;
  margin: 0 auto 1.5rem;
}

.section {
  margin-bottom: 2.5rem;
}
.section h2 {
  margin-bottom: 0.75rem;
}
.section > p {
  color: var(--text2);
  line-height: 1.6;
  margin-bottom: 1rem;
}

.measure-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}
.measure-card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.9rem;
}
.measure-card h4 {
  font-size: 0.9rem;
  margin-bottom: 0.3rem;
  color: var(--accent);
}
.measure-card p {
  font-size: 0.8rem;
  color: var(--text2);
  line-height: 1.4;
}

.game-cards {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.game-info-card {
  display: flex;
  gap: 1rem;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.2rem;
}
.game-icon {
  font-size: 2rem;
  flex-shrink: 0;
}
.game-info-card h3 {
  margin-bottom: 0.3rem;
  font-size: 1.05rem;
}
.game-info-card p {
  color: var(--text2);
  font-size: 0.85rem;
  line-height: 1.5;
  margin-bottom: 0.5rem;
}
.game-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--text2);
}
.game-meta span {
  background: var(--bg3);
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
}

.code-block {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem;
  font-family: var(--mono);
  font-size: 0.8rem;
  overflow-x: auto;
  line-height: 1.7;
  margin-bottom: 0.5rem;
}
.code-note {
  font-size: 0.85rem;
}
.code-note code {
  background: var(--bg3);
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  font-size: 0.8rem;
}

.browse-section {
  display: flex;
  gap: 1rem;
  justify-content: center;
  padding: 1.5rem 0 2rem;
  border-top: 1px solid var(--border);
}
.btn-secondary {
  display: inline-block;
  padding: 0.8rem 2rem;
  background: var(--bg3);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.15s;
}
.btn-secondary:hover { border-color: var(--accent); text-decoration: none; }

@media (max-width: 640px) {
  .hero h1 { font-size: 1.8rem; }
  .measure-grid { grid-template-columns: 1fr; }
  .game-info-card { flex-direction: column; }
  .browse-section { flex-direction: column; align-items: center; }
}
</style>
