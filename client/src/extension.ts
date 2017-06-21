'use strict';

import * as path from 'path';

import { workspace, Disposable, ExtensionContext, commands } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';
import { enableValidation, disableValidation } from './kubernetes-commands';

export function activate(context: ExtensionContext) {

	commands.registerCommand('extension.k8s.enableValidation', enableValidation);
	commands.registerCommand('extension.k8s.disableValidation', disableValidation);

	// The se	rver is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server/src', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6009"] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: ['yaml'],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			configurationSection: 'k8s',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher("**/*.yaml")
		}
	}

	// Create the language client and start the client.
	let disposable = new LanguageClient('yaml', 'Kubernetes Support', serverOptions, clientOptions).start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);
}
