export async function confirmAction(title: string, message: string): Promise<boolean> {
  return window.confirm(`${title}\n\n${message}`);
}
