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
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: { code: 'MISSING_FILE', message: 'No file uploaded or file is empty' } },
        { status: 400 }
      );
    }

    const arrayBuffer = await (file as Blob).arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const pythonBin = getPythonPath();
    const pyScript = [
      'import sys, json',
      'from api.parse_docx import ParseDocx',
      'p = ParseDocx.__new__(ParseDocx)',
      'data = sys.stdin.buffer.read()',
      'res = p.extract_docx_text(data)',
      'print(json.dumps(res))',
    ].join('; ');

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn(pythonBin, ['-c', pyScript], {
        cwd: process.cwd(),
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
          reject(new Error(stderr || `Python parser failed with code ${code}`));
        }
      });

      proc.stdin.write(inputBuffer);
      proc.stdin.end();
    });

    const parsed = JSON.parse(result);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse docx';
    return NextResponse.json(
      { error: { code: 'INVALID_FILE_FORMAT', message } },
      { status: 400 }
    );
  }
}
