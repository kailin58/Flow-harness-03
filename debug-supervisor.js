'use strict';
const SA = require('./src/supervisor-agent');
const agent = new SA({});
agent.handleTask('write a utility function', {})
  .then(r => {
    console.log('Result:', JSON.stringify({ success: r.success, reworkCount: r.reworkCount }));
  })
  .catch(e => {
    console.log('Top-level error:', e.message);
    console.log(e.stack.split('\n').slice(0, 10).join('\n'));
  });
