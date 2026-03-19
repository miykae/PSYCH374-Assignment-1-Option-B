/**
 * PCA Task - Main Application Logic
 * Handles UI flow, task execution, and results display
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Consent ---
    const consentCheck = document.getElementById('consent-check');
    const consentBtn = document.getElementById('consent-btn');
    consentCheck?.addEventListener('change', () => {
        consentBtn.disabled = !consentCheck.checked;
    });
    consentBtn?.addEventListener('click', () => showScreen('training-prompt-screen'));

    // --- Educational Module (side panel) ---
    const eduPanel = document.getElementById('edu-panel');
    const safeguardsPanel = document.getElementById('safeguards-panel');
    const eduOverlay = document.getElementById('edu-overlay');
    const openEdu = () => {
        safeguardsPanel?.classList.remove('open');
        eduPanel?.classList.add('open');
        eduOverlay?.classList.add('open');
    };
    const openSafeguards = () => {
        eduPanel?.classList.remove('open');
        safeguardsPanel?.classList.add('open');
        eduOverlay?.classList.add('open');
    };
    const closePanels = () => {
        eduPanel?.classList.remove('open');
        safeguardsPanel?.classList.remove('open');
        eduOverlay?.classList.remove('open');
    };
    document.getElementById('edu-btn')?.addEventListener('click', openEdu);
    document.getElementById('safeguards-btn')?.addEventListener('click', openSafeguards);
    document.getElementById('edu-close-btn')?.addEventListener('click', closePanels);
    document.getElementById('safeguards-close-btn')?.addEventListener('click', closePanels);
    eduOverlay?.addEventListener('click', closePanels);

    // --- Training prompt ---
    document.getElementById('training-continue-btn')?.addEventListener('click', () => {
        showScreen('task-screen');
        runTask();
    });

    // --- Restart ---
    document.getElementById('restart-btn')?.addEventListener('click', () => {
        PCA_TASK.init();
        showScreen('consent-screen');
        consentCheck.checked = false;
        consentBtn.disabled = true;
    });

    // --- Export ---
    document.getElementById('export-btn')?.addEventListener('click', exportData);
});

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    const sideBtns = document.getElementById('side-buttons');
    if (sideBtns) {
        sideBtns.classList.toggle('side-buttons-hidden', id === 'consent-screen');
    }
}

async function runTask() {
    PCA_TASK.init();
    const taskRect = document.getElementById('task-rectangle');
    const signStim = document.getElementById('sign-stimulus');
    const goalStim = document.getElementById('goal-stimulus');
    const itiMsg = document.getElementById('iti-message');
    const trialCounter = document.getElementById('trial-counter');

    const config = PCA_TASK.getConfig();
    let consecutiveSignClicks = 0;
    let tipShown = false;
    let salienceReduced = false;  // After 3 consecutive cue clicks (post-tip): no sound, dim cue
    let score = 0;

    for (let i = 0; i < config.totalTrials; i++) {
        const trial = PCA_TASK.getNextTrial();
        if (!trial) break;

        trialCounter.textContent = `Trial ${trial.trialNum} of ${config.totalTrials}`;
        document.getElementById('score-display').textContent = `Points: ${score}`;
        itiMsg.textContent = 'Get ready...';
        signStim.classList.add('hidden');
        goalStim.classList.add('hidden');
        signStim.textContent = '';
        goalStim.textContent = '';

        // ITI
        await sleep(PCA_TASK.getRandomITI());

        // Position star and diamond randomly in the rectangle (ensure they don't overlap)
        const rect = taskRect.getBoundingClientRect();
        const padding = 50;
        const minDist = 120;
        let starPos = getRandomPos(rect, padding);
        let diamondPos = getRandomPos(rect, padding);
        let attempts = 0;
        while (dist(starPos, diamondPos) < minDist && attempts++ < 20) {
            diamondPos = getRandomPos(rect, padding);
        }

        // Show star (cue) first — play sound unless salience reduced
        itiMsg.textContent = 'Click the star or the gift box.';
        signStim.textContent = trial.cueEmoji;
        goalStim.textContent = trial.rewardEmoji;
        goalStim.classList.toggle('devalued', trial.isDevalued);
        positionStimulus(signStim, starPos, rect);
        positionStimulus(goalStim, diamondPos, rect);
        signStim.classList.remove('hidden');
        signStim.classList.toggle('reduced-salience', salienceReduced);
        PCA_TASK.setCueOnset();

        if (!salienceReduced) {
            playCueSound();
        }

        // Show gift box shortly after star (cue predicts reward)
        goalStim.classList.add('hidden');
        await sleep(500);
        goalStim.classList.remove('hidden');

        const response = await waitForResponse(signStim, goalStim);
        if (response) {
            const latency = response.timestamp - PCA_TASK.state.cueOnset;
            PCA_TASK.recordResponse(response.type, latency);

            if (response.type === 'goal') {
                score++;
                document.getElementById('score-display').textContent = `Points: ${score}`;
            }

            // Behavioural safeguards: 3 consecutive cue clicks → tip; 3 more (after tip) → devalue
            if (response.type === 'sign') {
                consecutiveSignClicks++;
                if (consecutiveSignClicks >= 3 && !tipShown) {
                    const tipBanner = document.getElementById('tip-banner');
                    tipBanner.textContent = 'Tip: Try going for the gift box instead!';
                    tipBanner.classList.add('visible');
                    tipShown = true;
                    consecutiveSignClicks = 0;  // Reset so they need 3 more to trigger devaluation
                } else if (consecutiveSignClicks >= 3 && tipShown && !salienceReduced) {
                    salienceReduced = true;
                }
            } else {
                consecutiveSignClicks = 0;
            }
        } else {
            consecutiveSignClicks = 0;
        }

        const postTrialDelay = response && response.type === 'goal' ? 250 : 600;
        await sleep(postTrialDelay);
    }

    showResults();
}

let _audioCtx = null;
function playCueSound() {
    try {
        const ctx = _audioCtx || (_audioCtx = new (window.AudioContext || window.webkitAudioContext)());
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
}

function getRandomPos(rect, padding) {
    return {
        x: padding + Math.random() * (rect.width - padding * 2),
        y: padding + Math.random() * (rect.height - padding * 2)
    };
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function positionStimulus(el, pos, rect) {
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
}

function waitForResponse(signStim, goalStim) {
    return new Promise(resolve => {
        let resolved = false;
        const doResolve = (val) => {
            if (resolved) return;
            resolved = true;
            signStim.removeEventListener('click', signHandler);
            goalStim.removeEventListener('click', goalHandler);
            resolve(val);
        };
        const signHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            doResolve({ type: 'sign', timestamp: performance.now() });
        };
        const goalHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            doResolve({ type: 'goal', timestamp: performance.now() });
        };
        signStim.addEventListener('click', signHandler);
        goalStim.addEventListener('click', goalHandler);

        // Timeout: remaining time from cue onset (goal appears at 500ms, so we have cueDuration-500ms left)
        const elapsed = performance.now() - PCA_TASK.state.cueOnset;
        const remaining = Math.max(2500, PCA_TASK.getConfig().cueDuration - elapsed);
        setTimeout(() => doResolve(null), remaining);
    });
}

function showResults() {
    showScreen('feedback-screen');

    const result = PCA_TASK.computePCAIndex();
    const deval = PCA_TASK.computeDevaluationSensitivity();
    const trialData = PCA_TASK.getTrialData();

    let devalText;
    if (deval) {
        devalText = deval.pSignDevalued === 0 && deval.pSignNormal === 0
            ? '<p><strong>Devaluation sensitivity:</strong> You clicked the goal on 100% of both devalued and normal trials — consistent goal-tracking.</p>'
            : `<p><strong>Devaluation sensitivity:</strong> Proportion of sign (vs goal) responses — ${(deval.pSignDevalued * 100).toFixed(0)}% on devalued trials vs ${(deval.pSignNormal * 100).toFixed(0)}% on normal trials.</p>`;
    } else {
        devalText = '<p><strong>Devaluation sensitivity:</strong> Not enough data — need responses on both devalued trials (package) and normal trials (gift box) to compute.</p>';
    }

    const summary = document.getElementById('results-summary');
    summary.innerHTML = `
        <h2>PCA Index: ${result.index.toFixed(2)}</h2>
        <p class="index-legend"><strong>−1</strong> = goal-tracking &nbsp;|&nbsp; <strong>+1</strong> = sign-tracking</p>
        <p><strong>Phenotype:</strong> ${result.phenotype}</p>
        <p>Sign responses: ${result.details.signResponses} | Goal responses: ${result.details.goalResponses}</p>
        ${result.details.avgLatencySign != null ? `<p>Avg latency to sign: ${result.details.avgLatencySign} ms</p>` : ''}
        ${result.details.avgLatencyGoal != null ? `<p>Avg latency to goal: ${result.details.avgLatencyGoal} ms</p>` : ''}
        ${devalText}
    `;

    // Reflective feedback (behavioural safeguard)
    const reflectiveText = document.getElementById('reflective-text');
    if (result.phenotype === 'Sign-tracker') {
        reflectiveText.textContent = 'You tended to respond more to the cue (sign) than the reward location. This is a common pattern. Research suggests that practicing goal-directed attention — focusing on outcomes rather than cues — can support flexible behaviour. Both patterns are normal variations.';
    } else if (result.phenotype === 'Goal-tracker') {
        reflectiveText.textContent = 'You tended to focus on the reward location (goal) rather than the cue. This goal-directed pattern is associated with stronger top-down control in research. Remember that sign-tracking and goal-tracking exist on a continuum — your pattern may vary across contexts.';
    } else {
        reflectiveText.textContent = 'You showed a mixed pattern, alternating between cue and goal. Many people fall in this intermediate range. Your behaviour may depend on context, motivation, or task demands.';
    }

    // Data visualization
    const viz = document.getElementById('results-visualization');
    viz.innerHTML = renderVisualization(result, trialData);
    bindVizToggles();
}

function bindVizToggles() {
    document.querySelectorAll('.viz-toggle-btn, .viz-close-btn').forEach(btn => {
        btn.onclick = () => {
            const vizId = btn.getAttribute('data-viz');
            const panel = document.getElementById('viz-' + vizId);
            if (!panel) return;
            const toggleBtn = document.querySelector(`.viz-toggle-btn[data-viz="${vizId}"]`);
            if (btn.classList.contains('viz-toggle-btn')) {
                const isOpen = panel.style.display !== 'none';
                panel.style.display = isOpen ? 'none' : 'block';
                toggleBtn.textContent = isOpen ? (vizId === 'trial-plot' ? 'Show trial-by-trial plot' : 'Show latency over trials') : (vizId === 'trial-plot' ? 'Hide trial-by-trial plot' : 'Hide latency plot');
            } else {
                panel.style.display = 'none';
                if (toggleBtn) toggleBtn.textContent = vizId === 'trial-plot' ? 'Show trial-by-trial plot' : 'Show latency over trials';
            }
        };
    });
}

function renderVisualization(result, trialData) {
    const signCount = result.details.signResponses;
    const goalCount = result.details.goalResponses;
    const total = result.details.totalResponses || 1;
    const signPct = (signCount / total) * 100;
    const goalPct = (goalCount / total) * 100;

    const totalTrials = PCA_TASK.getConfig().totalTrials;
    const trialByTrialData = [];
    const latencyData = [];
    for (let t = 1; t <= totalTrials; t++) {
        const d = trialData.find(x => x.trial === t);
        trialByTrialData.push(d ? d.response : null);
        latencyData.push(d ? d.latency : null);
    }
    const maxLatency = Math.max(...latencyData.filter(x => x != null), 1);

    const trialBars = trialByTrialData.map((r, i) => {
        const color = r === 'sign' ? '#e07c54' : r === 'goal' ? '#54b4a0' : '#30363d';
        return `<div class="trial-bar" style="background:${color}" title="Trial ${i + 1}: ${r || 'no response'}"></div>`;
    }).join('');

    const latencyBars = latencyData.map((lat, i) => {
        if (lat == null) return `<div class="latency-bar-wrap" title="Trial ${i + 1}: no response"><div class="latency-bar latency-bar-empty"></div></div>`;
        const pct = Math.max((lat / maxLatency) * 100, 4);
        return `<div class="latency-bar-wrap" title="Trial ${i + 1}: ${lat} ms"><div class="latency-bar" style="height:${pct}%"></div></div>`;
    }).join('');

    const yAxisTicks = [Math.round(maxLatency), Math.round(maxLatency * 0.75), Math.round(maxLatency * 0.5), Math.round(maxLatency * 0.25), 0];
    const yAxisLabels = yAxisTicks.map(t => `<div class="y-tick">${t} ms</div>`).join('');

    return `
        <div class="viz-container" style="margin: 1rem 0;">
            <h3>Response Distribution</h3>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <div style="flex: 1; background: rgba(224,124,84,0.3); border-radius: 8px; padding: 0.75rem; text-align: center;">
                    <div style="font-weight: bold; color: #e07c54;">Sign</div>
                    <div style="font-size: 1.5rem;">${signCount}</div>
                    <div style="font-size: 0.85rem; color: #8b949e;">${signPct.toFixed(0)}%</div>
                </div>
                <div style="flex: 1; background: rgba(84,180,160,0.3); border-radius: 8px; padding: 0.75rem; text-align: center;">
                    <div style="font-weight: bold; color: #54b4a0;">Goal</div>
                    <div style="font-size: 1.5rem;">${goalCount}</div>
                    <div style="font-size: 0.85rem; color: #8b949e;">${goalPct.toFixed(0)}%</div>
                </div>
            </div>
            <div style="margin-top: 1rem;">
                <div style="font-size: 0.85rem; color: #8b949e;">PCA Index continuum: −1 (goal-tracking) ← → +1 (sign-tracking)</div>
                <div style="height: 8px; background: linear-gradient(to right, #54b4a0, #8b949e, #e07c54); border-radius: 4px; margin-top: 0.25rem; position: relative;">
                    <div style="position: absolute; left: ${((result.index + 1) / 2) * 100}%; transform: translateX(-50%); top: -4px; width: 12px; height: 16px; background: white; border: 2px solid #30363d; border-radius: 4px;"></div>
                </div>
            </div>

            <div class="viz-toggles" style="margin-top: 1.5rem;">
                <button type="button" class="viz-toggle-btn" data-viz="trial-plot">Show trial-by-trial plot</button>
                <button type="button" class="viz-toggle-btn" data-viz="latency-plot">Show latency over trials</button>
            </div>
            <div id="viz-trial-plot" class="viz-expandable" style="display:none">
                <h4>Trial-by-trial: Sign vs Goal</h4>
                <p class="viz-caption">Each bar = one trial. Orange = star (sign), Green = gift box (goal), Gray = no response</p>
                <div class="trial-bars-container">${trialBars}</div>
                <button type="button" class="viz-close-btn" data-viz="trial-plot">Close</button>
            </div>
            <div id="viz-latency-plot" class="viz-expandable" style="display:none">
                <h4>Latency over trials (ms)</h4>
                <p class="viz-caption">Response time from cue onset to click for each trial</p>
                <div class="latency-chart-with-axis">
                    <div class="y-axis">${yAxisLabels}</div>
                    <div class="latency-bars-container">${latencyBars}</div>
                </div>
                <button type="button" class="viz-close-btn" data-viz="latency-plot">Close</button>
            </div>
        </div>
    `;
}


function exportData() {
    const result = PCA_TASK.computePCAIndex();
    const deval = PCA_TASK.computeDevaluationSensitivity();
    const trialData = PCA_TASK.getTrialData();
    const exportObj = {
        timestamp: new Date().toISOString(),
        pcaIndex: result,
        devaluationSensitivity: deval,
        trialData
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pca-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
