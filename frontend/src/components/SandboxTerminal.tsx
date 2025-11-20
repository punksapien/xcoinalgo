'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io, Socket } from 'socket.io-client';
import { X, Maximize2, Minimize2, RotateCcw, Power } from 'lucide-react';
import 'xterm/css/xterm.css';

interface SandboxTerminalProps {
  strategyId: string;
  code: string;
  requirements: string;
  token: string;
  onClose?: () => void;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'authenticating' | 'initializing' | 'ready' | 'error';

const STATUS_MESSAGES: Record<ConnectionStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting to server...',
  authenticating: 'Authenticating session...',
  initializing: 'Securing compute resources...',
  ready: 'Terminal Ready',
  error: 'Connection Error'
};

export const SandboxTerminal: React.FC<SandboxTerminalProps> = ({
  strategyId,
  code,
  requirements,
  token,
  onClose
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        black: '#32344a',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#ad8ee6',
        cyan: '#449dab',
        white: '#787c99',
        brightBlack: '#444b6a',
        brightRed: '#ff7a93',
        brightGreen: '#b9f27c',
        brightYellow: '#ff9e64',
        brightBlue: '#7da6ff',
        brightMagenta: '#bb9af7',
        brightCyan: '#0db9d7',
        brightWhite: '#acb0d0'
      },
      rows: 24,
      cols: 80,
      scrollback: 1000,
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome message
    term.writeln('\x1b[1;36m╔════════════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[1;36m║     XCoinAlgo Strategy Sandbox Terminal   ║\x1b[0m');
    term.writeln('\x1b[1;36m╚════════════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[33mConnecting to sandbox environment...\x1b[0m');
    term.writeln('');

    // Connect to WebSocket
    connectToTerminal(term);

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      term.dispose();
    };
  }, []);

  const connectToTerminal = (term: Terminal) => {
    setStatus('connecting');
    setStatusMessage(STATUS_MESSAGES.connecting);

    const socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      term.writeln('\x1b[32m✓ Connected to server\x1b[0m');
      setStatus('authenticating');
      setStatusMessage(STATUS_MESSAGES.authenticating);

      // Authenticate
      socket.emit('authenticate', { token });
    });

    socket.on('authenticated', () => {
      term.writeln('\x1b[32m✓ Authenticated\x1b[0m');
      setStatus('initializing');
      setStatusMessage(STATUS_MESSAGES.initializing);

      // Start terminal session
      socket.emit('terminal:start', {
        strategyId,
        code,
        requirements
      });
    });

    socket.on('terminal:status', (data: { status: string; message: string }) => {
      term.writeln(`\x1b[33m${data.message}\x1b[0m`);
      setStatusMessage(data.message);
    });

    socket.on('terminal:ready', (data: { sessionId: string; message: string }) => {
      sessionIdRef.current = data.sessionId;
      setStatus('ready');
      setStatusMessage(STATUS_MESSAGES.ready);

      term.writeln(`\x1b[32m✓ ${data.message}\x1b[0m`);
      term.writeln('');
      term.writeln('\x1b[36mYour strategy code is loaded in /workspace/strategy.py\x1b[0m');
      term.writeln('\x1b[36mType your commands below:\x1b[0m');
      term.writeln('');

      // Handle input from terminal
      let inputBuffer = '';
      term.onData((data) => {
        const code = data.charCodeAt(0);

        // Handle Enter key
        if (code === 13) {
          term.write('\r\n');
          if (inputBuffer.trim()) {
            socket.emit('terminal:exec', {
              sessionId: sessionIdRef.current,
              command: inputBuffer.trim()
            });
          }
          inputBuffer = '';
          return;
        }

        // Handle Backspace
        if (code === 127) {
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1);
            term.write('\b \b');
          }
          return;
        }

        // Handle Ctrl+C
        if (code === 3) {
          term.write('^C\r\n');
          inputBuffer = '';
          return;
        }

        // Regular character
        inputBuffer += data;
        term.write(data);
      });
    });

    socket.on('terminal:data', (data: string) => {
      term.write(data);
    });

    socket.on('terminal:error', (data: { message: string }) => {
      term.writeln(`\r\n\x1b[31m✗ Error: ${data.message}\x1b[0m`);
      setStatus('error');
      setError(data.message);
    });

    socket.on('terminal:stopped', () => {
      term.writeln('\r\n\x1b[33mTerminal session ended\x1b[0m');
      setStatus('disconnected');
    });

    socket.on('terminal:timeout', (data: { message: string }) => {
      term.writeln(`\r\n\x1b[33m⚠ ${data.message}\x1b[0m`);
      setStatus('disconnected');
    });

    socket.on('disconnect', () => {
      term.writeln('\r\n\x1b[31m✗ Disconnected from server\x1b[0m');
      setStatus('disconnected');
    });

    socket.on('error', (error) => {
      term.writeln(`\r\n\x1b[31m✗ Connection error: ${error.message}\x1b[0m`);
      setStatus('error');
      setError(error.message);
    });
  };

  const handleClear = () => {
    xtermRef.current?.clear();
  };

  const handleStop = () => {
    if (socketRef.current && sessionIdRef.current) {
      socketRef.current.emit('terminal:stop', { sessionId: sessionIdRef.current });
    }
    if (onClose) {
      onClose();
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'ready':
        return 'bg-green-500';
      case 'connecting':
      case 'authenticating':
      case 'initializing':
        return 'bg-yellow-500 animate-pulse';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className={`border border-gray-700 rounded-lg bg-gray-900 overflow-hidden transition-all ${
      isMaximized ? 'fixed inset-4 z-50' : 'relative'
    }`}>
      {/* Header */}
      <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
            <span className="text-sm font-medium text-gray-300">
              Sandbox Terminal
            </span>
          </div>
          <span className="text-xs text-gray-500">
            {statusMessage || STATUS_MESSAGES[status]}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Clear terminal"
          >
            <RotateCcw className="w-4 h-4 text-gray-400" />
          </button>

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title={isMaximized ? 'Minimize' : 'Maximize'}
          >
            {isMaximized ? (
              <Minimize2 className="w-4 h-4 text-gray-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-400" />
            )}
          </button>

          <button
            onClick={handleStop}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Stop terminal"
          >
            <Power className="w-4 h-4 text-red-400" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Close"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        className={`p-2 ${isMaximized ? 'h-[calc(100vh-6rem)]' : 'h-[500px]'}`}
        style={{ backgroundColor: '#1a1b26' }}
      />

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2 bg-red-900/20 border-t border-red-700/50">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
};

export default SandboxTerminal;
