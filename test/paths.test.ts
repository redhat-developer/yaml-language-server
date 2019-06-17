import assert = require('assert');
import { WorkspaceFolder } from 'vscode-languageserver';
import { relativeToAbsolutePath, isRelativePath } from '../src/languageservice/utils/paths';
import URI from '../src/languageservice/utils/uri';

class TestWorkspace {
    folders: WorkspaceFolder[];
    root: URI;

    constructor(workspaceFolders: WorkspaceFolder[], workspaceRoot: string) {
        this.folders = workspaceFolders;
        this.root = URI.parse(workspaceRoot);
    }
}

const resolve = (ws: TestWorkspace, relPath: string): string =>
    relativeToAbsolutePath(ws.folders, ws.root, relPath);

suite('File path tests', () => {
    describe('Relative path checking and resolution', () => {
        it('Rejects "//notpath/file.json"', () => {
            assert(!isRelativePath('//notpath/file.json'));
        });

        it('Rejects "/file.json"', () => {
            assert(!isRelativePath('/file.json'));
        });

        it('Rejects "directory.json/"', () => {
            assert(!isRelativePath('directory.json/'));
        });

        it('Rejects "./folder/notfile.json/"', () => {
            assert(!isRelativePath('./folder/notfile.json/'));
        });

        it('Rejects "/absolute/path.json"', () => {
            assert(!isRelativePath('/absolute/path.json'));
        });

        it('Rejects "C:\\notrelative\\path.json"', () => {
            assert(!isRelativePath('C:\\notrelative\\path.json'));
        });

        const ws1 = new TestWorkspace([
            {
                uri: 'file:///home/aFolder/',
                name: 'aFolder'
            }
        ],
        'file:///home/aFolder/');

        const ws2 = new TestWorkspace([
            {
                uri: 'file:///usr/testuser/projects/workspace/folder-1/',
                name: 'folder-1'
            },
            {
                uri: 'file:///usr/testuser/projects/workspace/folder-2/',
                name: 'folder-2'
            },
            {
                uri: 'file:///usr/testuser/projects/workspace/folder-3/',
                name: 'folder-3'
            }
        ],
        'file:///usr/testuser/projects/workspace/');

        const ws3 = new TestWorkspace([
            {
                uri: 'file:///c%3A/Users/testuser/dev/carrots',
                name: 'carrots'
            },
            {
                uri: 'file:///c%3A/Users/testuser/dev/potatoes',
                name: 'potatoes'
            }
        ],
        'file:///c%3A/Users/testuser/dev/potatoes');

        describe('Relative path = "file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, 'file.json'),
                            'file:///home/aFolder/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, 'file.json'),
                            'file:///usr/testuser/projects/workspace/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, 'file.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/file.json');
            });
        });

        describe('Relative path = "./file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('./file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, './file.json'),
                            'file:///home/aFolder/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, './file.json'),
                            'file:///usr/testuser/projects/workspace/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, './file.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/file.json');
            });
        });

        describe('Relative path = ".\\file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('.\\file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, '.\\file.json'),
                            'file:///home/aFolder/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, '.\\file.json'),
                            'file:///usr/testuser/projects/workspace/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, '.\\file.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/file.json');
            });
        });

        describe('Relative path = "./folder/file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('./folder/file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, './folder/file.json'),
                            'file:///home/aFolder/folder/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, './folder/file.json'),
                            'file:///usr/testuser/projects/workspace/folder/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, './folder/file.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/folder/file.json');
            });
        });

        describe('Relative path = ".\\folder\\file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('.\\folder\\file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, '.\\folder\\file.json'),
                            'file:///home/aFolder/folder/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, '.\\folder\\file.json'),
                            'file:///usr/testuser/projects/workspace/folder/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, '.\\folder\\file.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/folder/file.json');
            });
        });

        describe('Relative path = "./long/path/to/file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('./long/path/to/file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, './long/path/to/file.json'),
                            'file:///home/aFolder/long/path/to/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, './long/path/to/file.json'),
                            'file:///usr/testuser/projects/workspace/long/path/to/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, './long/path/to/file.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/long/path/to/file.json');
            });
        });

        describe('Relative path = ".\\long\\path\\to\\file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('.\\long\\path\\to\\file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, '.\\long\\path\\to\\file.json'),
                            'file:///home/aFolder/long/path/to/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, '.\\long\\path\\to\\file.json'),
                            'file:///usr/testuser/projects/workspace/long/path/to/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, '.\\long\\path\\to\\file.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/long/path/to/file.json');
            });
        });

        describe('Relative path = "./mixed/delimiters\\path/file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('./mixed/delimiters\\path/file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, './mixed/delimiters\\path/file.json'),
                            'file:///home/aFolder/mixed/delimiters/path/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, './mixed/delimiters\\path/file.json'),
                            'file:///usr/testuser/projects/workspace/mixed/delimiters/path/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, './mixed/delimiters\\path/file.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/mixed/delimiters/path/file.json');
            });
        });

        describe('Relative path = "../file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('../file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, '../file.json'),
                            'file:///home/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, '../file.json'),
                            'file:///usr/testuser/projects/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, '../file.json'),
                            'file:///c%3A/Users/testuser/dev/file.json');
            });
        });

        describe('Relative path = "./relative/../file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('./relative/../file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, './relative/../file.json'),
                            'file:///home/aFolder/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, './relative/../file.json'),
                            'file:///usr/testuser/projects/workspace/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, './relative/../file.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/file.json');
            });
        });

        describe('Relative path = "file.long.extension.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('file.long.extension.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, 'file.long.extension.json'),
                            'file:///home/aFolder/file.long.extension.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, 'file.long.extension.json'),
                            'file:///usr/testuser/projects/workspace/file.long.extension.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, 'file.long.extension.json'),
                            'file:///c%3A/Users/testuser/dev/potatoes/file.long.extension.json');
            });
        });

        describe('Relative path = "..\\..\\also\\relative\\file.json"', () => {
            it('Recognises relative path', () => {
                assert(isRelativePath('..\\..\\also\\relative\\file.json'));
            });

            it('Resolves relative path in single-root workspace', () => {
                assert.equal(resolve(ws1, '..\\..\\also\\relative\\file.json'),
                            'file:///also/relative/file.json');
            });

            it('Resolves relative path in multi-root workspace', () => {
                assert.equal(resolve(ws2, '..\\..\\also\\relative\\file.json'),
                            'file:///usr/testuser/also/relative/file.json');
            });

            it('Resolves relative path in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, '..\\..\\also\\relative\\file.json'),
                            'file:///c%3A/Users/testuser/also/relative/file.json');
            });
        });

        describe('Relative path = a workspace folder', () => {
            it('Recognises relative path "aFolder/file.json"', () => {
                assert(isRelativePath('aFolder/file.json'));
            });

            it('Resolves "aFolder/file.json" in single-root workspace', () => {
                assert.equal(resolve(ws1, 'aFolder/file.json'),
                            'file:///home/aFolder/file.json');
            });

            it('Resolves "folder-2/file.json" in multi-root workspace', () => {
                assert.equal(resolve(ws2, 'folder-2/file.json'),
                            'file:///usr/testuser/projects/workspace/folder-2/file.json');
            });

            it('Resolves "carrots/file.json" in multi-root nested workspace', () => {
                assert.equal(resolve(ws3, 'carrots/file.json'),
                            'file:///c%3A/Users/testuser/dev/carrots/file.json');
            });
        });
    });
});
