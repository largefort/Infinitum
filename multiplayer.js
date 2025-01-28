// Using global React from CDN instead of imports
const { useState, useSyncExternalStore } = window.React;
const ReactDOM = window.ReactDOM;
const WebsimSocket = window.WebsimSocket;

// Multiplayer React component
function MultiplayerLobby() {
  const [room] = useState(() => {
    try {
      return new WebsimSocket();
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      return null;
    }
  });

  const peers = useSyncExternalStore(
    (callback) => room ? room.party.subscribe(callback) : () => {},
    () => room ? room.party.peers : {}
  );

  // Add error handling for room operations
  function startGame() {
    try {
      if (!room) {
        throw new Error('No WebSocket connection');
      }
      room.send({
        type: "gameStart"
      });
    } catch (error) {
      console.error('Failed to start game:', error);
      alert('Failed to start game. Please try again.');
    }
  }

  // Add loading and error states
  if (!room) {
    return React.createElement('div', { className: "multiplayer-error" },
      "Failed to connect to multiplayer server. Please refresh the page."
    );
  }

  return React.createElement('div', { className: "multiplayer-lobby" }, [
    React.createElement('h2', null, "Multiplayer Lobby"),
    React.createElement('div', { className: "player-list" }, [
      React.createElement('h3', null, "Connected Players"),
      Object.entries(peers).map(([clientId, peer]) => 
        React.createElement('div', { key: clientId, className: "player-item" }, [
          React.createElement('img', {
            className: "player-avatar",
            src: `https://images.websim.ai/avatar/${peer.username}`,
            alt: peer.username,
            onError: (e) => {
              e.target.onerror = null;
              e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="%23666"/></svg>';
            }
          }),
          React.createElement('span', null, peer.username)
        ])
      )
    ]),
    React.createElement('button', { 
      onClick: startGame,
      className: "start-game-btn"
    }, "Start Game")
  ]);
}

// Create root and render with error boundary
try {
  const container = document.getElementById('multiplayer-root');
  if (!container) {
    throw new Error('Multiplayer root element not found');
  }
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(MultiplayerLobby));
} catch (error) {
  console.error('Failed to render multiplayer lobby:', error);
  // Show error message in multiplayer root if it exists
  const container = document.getElementById('multiplayer-root');
  if (container) {
    container.innerHTML = '<div class="multiplayer-error">Failed to load multiplayer. Please refresh the page.</div>';
  }
}