import fs from 'node:fs/promises';

await fs.mkdir('data', { recursive: true });

try {
  await fs.access('data/forms.json');
} catch {
  await fs.writeFile('data/forms.json', JSON.stringify({ forms: [], responses: [], webhookEvents: [] }, null, 2));
}
