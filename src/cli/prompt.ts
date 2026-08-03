/**
 * One readline question as a Promise. Resolves null when input has ended:
 * either the interface closes while waiting (EOF mid-question) or it was
 * already closed when called (EOF arrived during a slow request).
 */
import type * as readline from 'node:readline';

export async function prompt(
  rl: readline.Interface,
  question: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const onClose = (): void => resolve(null);
    rl.once('close', onClose);
    try {
      rl.question(question, (answer) => {
        rl.off('close', onClose);
        resolve(answer);
      });
    } catch {
      // readline already closed — treat as end of input, same as EOF
      rl.off('close', onClose);
      resolve(null);
    }
  });
}
