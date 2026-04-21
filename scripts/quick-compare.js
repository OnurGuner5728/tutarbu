const bt = JSON.parse(require('fs').readFileSync('backtest_comprehensive.json', 'utf8'));
bt.matches.forEach((m, i) => {
  const p = m.model.probs.map(x => (x * 100).toFixed(1));
  console.log((i+1) + '. ' + m.match + ' | pred:' + m.model.predScore + ' actual:' + m.actual.score +
    ' | lam:' + m.model.lambdaHome + '/' + m.model.lambdaAway +
    ' | 1x2:[' + p.join(',') + '] | 1x2:' + m.model.predictedResult + ' actual:' + m.actual.result);
});
