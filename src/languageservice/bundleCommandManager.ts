import { ExecuteCommandParams } from 'vscode-languageserver';

export class BundleCommandManager {

  private commands = new Map<string, Function>();

  registerCommand(name: string, action: Function) {
    this.commands.set(name, action);
  }

  /**
   * Execute a registered command if found
   * @param e the ExecuteCommandParams you want to use
   */
  executeCommand(e: ExecuteCommandParams): any {
    const com = this.commands.get(e.command);
    if (com) {
      return com.apply(e.arguments);
    }
    return null;
  }

}
