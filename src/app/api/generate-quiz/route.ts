import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function getPythonPath(): string {
  const venvPython = path.join(os.homedir(), 'python_envs/p313_llm/bin/python');
  return process.env.PYTHON_PATH || venvPython;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
      const proc = spawn(pythonBin, ['-c', pyScript], {
        cwd: process.cwd(),
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Quiz generator failed with code ${code}`));
        }
      });

      proc.stdin.write(JSON.stringify(body));
      proc.stdin.end();
    });

    const parsed = JSON.parse(result);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Quiz generation failed';
    const isRateLimited = message.includes('429') || message.toLowerCase().includes('quota');
    return NextResponse.json(
      {
        error: {
          code: isRateLimited ? 'RATE_LIMITED' : 'GENERATION_FAILED',
          message: isRateLimited
            ? 'Gemini API rate limit reached. Try again in a minute.'
            : message,
        },
      },
      { status: isRateLimited ? 429 : 500 }
    );
  }
}
