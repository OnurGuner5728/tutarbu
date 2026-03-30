const https = require('https');

const options = {
  hostname: 'api.sofascore.com',
  path: `/api/v1/sport/football/scheduled-events/${new Date().toISOString().split('T')[0]}`,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    const json = JSON.parse(data);
    const events = json.events || [];
    const live = events.find(e => e.status.type === 'inprogress');
    const notstarted = events.find(e => e.status.type === 'notstarted');
    const finished = events.find(e => e.status.type === 'finished');

    console.log('Live ID:', live ? live.id : 'None');
    console.log('Not Started ID:', notstarted ? notstarted.id : 'None');
    console.log('Finished ID:', finished ? finished.id : 'None');
  });
}).on('error', (err) => {
  console.log('Error:', err.message);
});
