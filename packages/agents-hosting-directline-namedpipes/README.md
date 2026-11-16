# @microsoft/agents-hosting-directline-namedpipes

## Overview

Windows named-pipe transport for the Microsoft 365 Agents SDK for JavaScript and
TypeScript. Enables DirectLine communication in Windows Azure App Service and
DirectLineFlex scenarios, using a wire protocol compatible with the .NET Agents SDK.

## Important considerations

<a id="platform-support"></a>
<a id="custom-pipe-name"></a>

> **Windows only.** Pipe names must match the connector configuration. The local
> Windows pipe boundary is the trust boundary; this transport does not add HTTP or
> Entra authentication.

## Documentation

- [Microsoft 365 Agents SDK documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)
- [Named-pipe setup, protocol, and security guide](https://github.com/microsoft/Agents-for-js/blob/main/docs/packages/agents-hosting-directline-namedpipes.md)
- [API reference](https://learn.microsoft.com/javascript/api/@microsoft/agents-hosting-directline-namedpipes?view=agents-sdk-js-latest)
- [Release notes](https://github.com/microsoft/Agents-for-js/releases)
