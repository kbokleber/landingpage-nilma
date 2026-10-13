const { publishDuePosts } = require('./posts');

const INTERVAL_MS = 60_000;
let timer = null;

function runOnce() {
  try {
    const released = publishDuePosts();
    if (released > 0) {
      console.log(`Agendamento: ${released} post(s) publicado(s) automaticamente.`);
    }
  } catch (err) {
    console.error('Agendamento: falha ao publicar posts vencidos:', err.message || err);
  }
}

function startScheduler() {
  if (timer) return;
  runOnce();
  timer = setInterval(runOnce, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

function stopScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = { startScheduler, stopScheduler, runOnce };
