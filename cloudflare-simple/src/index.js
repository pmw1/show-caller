/**
 * Liftover Queue - Simple Cloudflare Worker
 * This gets you up and running quickly
 */

// In-memory queue (resets on worker restart - use KV in production)
let queue = [];
let screeningQueue = [];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handling
    switch (url.pathname) {
      case '/':
        return new Response(getCallerPage(), {
          headers: { 
            'Content-Type': 'text/html',
            ...corsHeaders 
          }
        });
      
      case '/operator':
        return new Response(getOperatorPage(), {
          headers: { 
            'Content-Type': 'text/html',
            ...corsHeaders 
          }
        });
      
      case '/api/join':
        if (request.method === 'POST') {
          const data = await request.json();
          const caller = {
            id: crypto.randomUUID(),
            name: data.name,
            topic: data.topic,
            timestamp: Date.now()
          };
          screeningQueue.push(caller);
          
          return new Response(JSON.stringify({ 
            success: true, 
            callerId: caller.id,
            position: screeningQueue.length 
          }), {
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders 
            }
          });
        }
        break;
      
      case '/api/queue':
        return new Response(JSON.stringify({
          screening: screeningQueue,
          main: queue,
          slots: {
            slot1: null,
            slot2: null
          }
        }), {
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      
      case '/api/approve':
        if (request.method === 'POST') {
          const { callerId } = await request.json();
          const index = screeningQueue.findIndex(c => c.id === callerId);
          if (index !== -1) {
            const caller = screeningQueue.splice(index, 1)[0];
            queue.push(caller);
            return new Response(JSON.stringify({ success: true }), {
              headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders 
              }
            });
          }
        }
        break;
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

function getCallerPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Liftover Queue - Join the Show</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      border-radius: 20px;
      padding: 40px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      color: #333;
      margin-bottom: 30px;
      text-align: center;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #555;
    }
    input, textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
    }
    button {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover {
      opacity: 0.9;
    }
    #status {
      margin-top: 20px;
      padding: 20px;
      background: #f0f0f0;
      border-radius: 8px;
      text-align: center;
      display: none;
    }
    .queue-position {
      font-size: 3em;
      color: #667eea;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Join the Show</h1>
    <form id="joinForm">
      <div class="form-group">
        <label for="name">Your Name</label>
        <input type="text" id="name" required>
      </div>
      <div class="form-group">
        <label for="topic">What do you want to talk about?</label>
        <textarea id="topic" rows="4" required></textarea>
      </div>
      <button type="submit">Join Queue</button>
    </form>
    <div id="status">
      <p>You're in the screening queue!</p>
      <p>Position: <span class="queue-position" id="position">-</span></p>
    </div>
  </div>
  
  <script>
    document.getElementById('joinForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('name').value;
      const topic = document.getElementById('topic').value;
      
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, topic })
      });
      
      const data = await response.json();
      if (data.success) {
        document.getElementById('joinForm').style.display = 'none';
        document.getElementById('status').style.display = 'block';
        document.getElementById('position').textContent = data.position;
        
        // Poll for updates
        setInterval(async () => {
          const queueResp = await fetch('/api/queue');
          const queueData = await queueResp.json();
          const myIndex = queueData.screening.findIndex(c => c.id === data.callerId);
          if (myIndex !== -1) {
            document.getElementById('position').textContent = myIndex + 1;
          }
        }, 2000);
      }
    });
  </script>
</body>
</html>`;
}

function getOperatorPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Operator Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      padding: 20px;
    }
    h1 { margin-bottom: 20px; }
    .panel {
      background: #16213e;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .caller {
      background: #0f3460;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    button {
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-weight: 600;
    }
    .approve-btn {
      background: #4CAF50;
      color: white;
    }
    .take-btn {
      background: #667eea;
      color: white;
    }
  </style>
</head>
<body>
  <h1>Operator Dashboard</h1>
  
  <div class="panel">
    <h2>Screening Queue</h2>
    <div id="screeningQueue"></div>
  </div>
  
  <div class="panel">
    <h2>Main Queue</h2>
    <div id="mainQueue"></div>
  </div>
  
  <script>
    async function updateQueues() {
      const response = await fetch('/api/queue');
      const data = await response.json();
      
      // Update screening queue
      const screeningHtml = data.screening.map(caller => \`
        <div class="caller">
          <div>
            <strong>\${caller.name}</strong><br>
            <small>\${caller.topic}</small>
          </div>
          <button class="approve-btn" onclick="approve('\${caller.id}')">Approve</button>
        </div>
      \`).join('') || '<p>No callers in screening</p>';
      
      document.getElementById('screeningQueue').innerHTML = screeningHtml;
      
      // Update main queue
      const mainHtml = data.main.map((caller, index) => \`
        <div class="caller">
          <div>
            <strong>#\${index + 1} - \${caller.name}</strong><br>
            <small>\${caller.topic}</small>
          </div>
          <button class="take-btn">Take Call</button>
        </div>
      \`).join('') || '<p>No callers in queue</p>';
      
      document.getElementById('mainQueue').innerHTML = mainHtml;
    }
    
    async function approve(callerId) {
      await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId })
      });
      updateQueues();
    }
    
    // Update every 2 seconds
    updateQueues();
    setInterval(updateQueues, 2000);
  </script>
</body>
</html>`;
}