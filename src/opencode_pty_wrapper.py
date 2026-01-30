#!/usr/bin/env python3
import pty
import os
import sys
import select
import subprocess
import fcntl
import platform
import termios
import struct
import array

def set_winsize(fd, row, col, xpixel=0, ypixel=0):
    """Set the terminal size of the PTY."""
    wf = struct.pack('HHHH', row, col, xpixel, ypixel)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, wf)

def get_opencode_command():
    """Get the appropriate command to run OpenCode CLI."""
    if platform.system() == 'Windows':
        # This shouldn't happen as this script runs inside WSL/Linux
        return ['wsl', '--', 'opencode']
    else:
        return ['opencode']

def main():
    # Parse command line arguments
    skip_permissions = '--skip-permissions' in sys.argv
    
    # Spawn OpenCode with a proper PTY
    master, slave = pty.openpty()
    
    # Set default terminal size
    try:
        set_winsize(slave, 30, 120)
    except:
        pass

    # Start OpenCode process with the slave PTY as its controlling terminal
    opencode_args = get_opencode_command()
    
    opencode_process = subprocess.Popen(
        opencode_args,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
        preexec_fn=os.setsid if platform.system() != 'Windows' else None
    )
    
    # Close the slave end in the parent process
    os.close(slave)
    
    # Set stdin and master to non-blocking mode
    for fd in [sys.stdin.fileno(), master]:
        flags = fcntl.fcntl(fd, fcntl.F_GETFL)
        fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    
    try:
        while opencode_process.poll() is None:
            try:
                # Use select to handle both reading from master and stdin
                ready, _, _ = select.select([master, sys.stdin.fileno()], [], [], 0.1)
                
                if master in ready:
                    try:
                        data = os.read(master, 4096)
                        if data:
                            sys.stdout.buffer.write(data)
                            sys.stdout.buffer.flush()
                        else:
                            # EOF from master
                            break
                    except OSError:
                        break
                
                if sys.stdin.fileno() in ready:
                    try:
                        data = os.read(sys.stdin.fileno(), 1024)
                        if data:
                            os.write(master, data)
                    except (OSError, BlockingIOError):
                        pass
            except (select.error, InterruptedError):
                continue
                    
    except KeyboardInterrupt:
        pass
    finally:
        # Clean up
        if opencode_process.poll() is None:
            opencode_process.terminate()
            try:
                opencode_process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                opencode_process.kill()
        
        os.close(master)

if __name__ == '__main__':
    main()
