import { exec } from "child_process";

export function runTests() {
  return new Promise((resolve, reject) => {
    exec("npm test", { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        reject({
          success: false,
          output: stdout + stderr,
        });
      } else {
        resolve({
          success: true,
          output: stdout,
        });
      }
    });
  });
}
