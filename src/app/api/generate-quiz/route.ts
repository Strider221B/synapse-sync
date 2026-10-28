import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function getPythonPath(): string {
  const venvPython = path.join(os.homedir(), 'python_envs/p313_llm/bin/python');
  return process.env.PYTHON_PATH || venvPython;
}

const SUBPROCESS_TIMEOUT_MS = 720_000;

interface QuizStats {
  total_calls: number;
  successful_calls: number;
  timed_out_calls: number;
  retry_calls: number;
  backup_key_calls: number;
  backup_failovers: number;
  active_key_index: number;
  active_key_masked: string;
}

interface QuizSessionAccumulator {
  totalCalls: number;
  successfulCalls: number;
  timedOutCalls: number;
  retryCalls: number;
  backupKeyCalls: number;
  backupFailovers: number;
  chunksCompleted: number;
  totalChunks: number;
  startTime: number;
}

const activeSessions = new Map<string, QuizSessionAccumulator>();

function logCompletionSummary(session: QuizSessionAccumulator): void {
  const elapsedSec = ((Date.now() - session.startTime) / 1000).toFixed(1);
  console.log('\n======================================================================');
  console.log(' [Quiz Generation Completed] Gemini API Execution Summary');
  console.log('======================================================================');
  console.log(`  • Chunks Processed:       ${session.chunksCompleted} / ${session.totalChunks}`);
  console.log(`  • Total Gemini API Calls: ${session.totalCalls}`);
  console.log(`  • Successful Calls:       ${session.successfulCalls}`);
  console.log(`  • Timed Out Calls:        ${session.timedOutCalls}`);
  console.log(`  • Retries:                ${session.retryCalls}`);
  console.log(`  • Backup Key Calls:       ${session.backupKeyCalls}`);
  console.log(`  • Backup Key Failovers:   ${session.backupFailovers}`);
  console.log(`  • Total Time:             ${elapsedSec}s`);
  console.log('======================================================================\n');
}

function recordSessionProgress(
  sessionId: string,
  chunkIndex: number,
  totalChunks: number,
  durationMs: number,
  stats?: QuizStats
): void {
  let session = activeSessions.get(sessionId);
  if (!session) {
    session = {
      totalCalls: 0,
      successfulCalls: 0,
      timedOutCalls: 0,
      retryCalls: 0,
      backupKeyCalls: 0,
      backupFailovers: 0,
      chunksCompleted: 0,
      totalChunks,
      startTime: Date.now() - durationMs,
    };
    activeSessions.set(sessionId, session);
  }

  session.totalChunks = totalChunks;
  session.chunksCompleted += 1;
  if (stats) {
    session.totalCalls += stats.total_calls ?? 0;
    session.successfulCalls += stats.successful_calls ?? 0;
    session.timedOutCalls += stats.timed_out_calls ?? 0;
    session.retryCalls += stats.retry_calls ?? 0;
    session.backupKeyCalls += stats.backup_key_calls ?? 0;
    session.backupFailovers += stats.backup_failovers ?? 0;
  }

  const durationSec = (durationMs / 1000).toFixed(1);
  console.log(
    `[Quiz Generator] Chunk ${chunkIndex}/${totalChunks} completed in ${durationSec}s ` +
    `(Gemini calls: ${stats?.total_calls ?? 1}, timed out: ${stats?.timed_out_calls ?? 0}, ` +
    `backup key calls: ${stats?.backup_key_calls ?? 0})`
  );

  if (session.chunksCompleted >= totalChunks || chunkIndex >= totalChunks) {
    logCompletionSummary(session);
    activeSessions.delete(sessionId);
  }
}

export async function POST(req: NextRequest) {
  let sessionId = `single-${Date.now()}`;
  let chunkIndex = 1;
  let totalChunks = 1;
  const startTime = Date.now();

  try {
    const body = await req.json();
    sessionId = body.sessionId ? String(body.sessionId) : sessionId;
    chunkIndex = typeof body.chunkIndex === 'number' ? body.chunkIndex : 1;
    totalChunks = typeof body.totalChunks === 'number' ? body.totalChunks : 1;
    const text = String(body.text || '').trim();

    if (text.length < 50) {
      return NextResponse.json(
        { error: { code: 'TEXT_TOO_SHORT', message: 'Provide at least 50 characters of text.' } },
        { status: 400 }
      );
    }

    const pythonBin = getPythonPath();
    const pyScript = [
      'import sys, json',
      'from api.generate_quiz import GenerateQuiz',
      'body = json.loads(sys.stdin.read())',
      'g = GenerateQuiz.__new__(GenerateQuiz)',
      'text = body.get("text", "")',
      'args, kwargs = g._extract_post_params(body)',
      'res = g.generate_quiz(text, *args, **kwargs)',
      'print(json.dumps(res))',
    ].join('\n');

    const result = await new Promise<string>((resolve, reject) => {
      let isSettled = false;
      const proc = spawn(pythonBin, ['-c', pyScript], {
        cwd: process.cwd(),
        env: { ...process.env },
      });

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try {
            proc.kill('SIGKILL');
          } catch {
            // Subprocess may have already terminated
          }
          reject(new Error('Quiz generation subprocess timed out after 720 seconds'));
        }
      }, SUBPROCESS_TIMEOUT_MS);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      proc.stdin.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      proc.on('close', (code) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(stderr || `Quiz generator failed with code ${code}`));
          }
        }
      });

      proc.stdin.write(JSON.stringify(body));
      proc.stdin.end();
    });

    const parsed = JSON.parse(result);
    const durationMs = Date.now() - startTime;
    recordSessionProgress(
      sessionId,
      chunkIndex,
      totalChunks,
      durationMs,
      parsed?.metadata?.stats
    );

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Quiz generation failed';
    const isRateLimited = message.includes('429') || message.toLowerCase().includes('quota');
    const isTimeout =
      message.toLowerCase().includes('timeout') || message.toLowerCase().includes('timed out');

    const session = activeSessions.get(sessionId);
    if (session) {
      session.totalCalls += 1;
      if (isTimeout) {
        session.timedOutCalls += 1;
      }
      console.error(
        `[Quiz Generator Error] Chunk ${chunkIndex}/${totalChunks} failed: ${message} ` +
        `(Calls so far: ${session.totalCalls}, Timed out: ${session.timedOutCalls}, Backup key calls: ${session.backupKeyCalls})`
      );
    } else {
      console.error(`[Quiz Generator Error] Chunk ${chunkIndex}/${totalChunks} failed: ${message}`);
    }

    return NextResponse.json(
      {
        error: {
          code: isRateLimited ? 'RATE_LIMITED' : isTimeout ? 'TIMEOUT' : 'GENERATION_FAILED',
          message: isRateLimited
            ? 'Gemini API rate limit reached. Try again in a minute.'
            : isTimeout
            ? 'Quiz generation timed out. Please try again.'
            : message,
        },
      },
      { status: isRateLimited ? 429 : isTimeout ? 504 : 500 }
    );
  }
}
