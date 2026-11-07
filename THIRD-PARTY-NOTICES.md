# Third-party notices

Сторонние библиотеки, которые входят в сборку Gearbit, и их лицензии. Gearbit распространяется по [GPL-3.0-only](LICENSE), и все перечисленные лицензии с ней совместимы. Добавляете библиотеку в сборку — допишите её сюда.

Third-party libraries shipped with Gearbit and their licenses. Gearbit itself is licensed under [GPL-3.0-only](LICENSE); all licenses below are compatible with it.

Only components that end up in the built program are listed. Build and test tools (TypeScript, Vite, xUnit and others) are not distributed with Gearbit.

## Web interface (`web/studio-ui`, bundled into `wwwroot`)

| Component | License | Copyright |
|---|---|---|
| [scratch-blocks](https://github.com/scratchfoundation/scratch-blocks) | Apache-2.0 | Massachusetts Institute of Technology, Scratch Foundation |
| [Blockly](https://github.com/google/blockly) (a dependency of scratch-blocks) and the plugins `@blockly/continuous-toolbox`, `@blockly/field-colour`, `@blockly/field-grid-dropdown` | Apache-2.0 | Google LLC |
| [CodeMirror 6](https://codemirror.net/): `@codemirror/*` | MIT | Marijn Haverbeke and others |
| [Lezer](https://lezer.codemirror.net/): `@lezer/common`, `@lezer/lr`, `@lezer/highlight`, `@lezer/python` | MIT | Marijn Haverbeke and others |
| `crelt`, `style-mod`, `w3c-keyname`, `@marijn/find-cluster-break` | MIT | Marijn Haverbeke and others |

The Apache License 2.0 text: <https://www.apache.org/licenses/LICENSE-2.0>.

The Scratch name and logo are trademarks of the Scratch Foundation. That is why the mode in Gearbit is called «Блоки» (Blocks), not "Scratch".

## .NET packages

| Component | License | Copyright |
|---|---|---|
| [Microsoft.CodeAnalysis.CSharp.Scripting](https://github.com/dotnet/roslyn) (Roslyn, runs C# programs) | MIT | .NET Foundation and Contributors |
| [Microsoft.Web.WebView2](https://www.nuget.org/packages/Microsoft.Web.WebView2) (the Gearbit window) | BSD-3-Clause, text below | Microsoft Corporation |

The .NET runtime and ASP.NET Core are licensed under MIT by the .NET Foundation and Contributors. The Microsoft Edge WebView2 Runtime is a part of Windows and is not shipped with Gearbit.

## MIT License

Applies to the MIT components listed above, each with its own copyright line.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Microsoft.Web.WebView2

```
Copyright (C) Microsoft Corporation. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * The name of Microsoft Corporation, or the names of its contributors
may not be used to endorse or promote products derived from this
software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Protocol sources

The SuperBot protocol was reverse-engineered with the help of public projects, listed in [docs/PROTOCOL-SUPERBOT.md](docs/PROTOCOL-SUPERBOT.md). Only facts about the protocol (byte layouts, constants) were taken from them, not code.
