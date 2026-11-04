<p align="center">
  <img src="docs/images/banner.svg" alt="Community Brief — Recording, transcription and meeting analysis" width="100%">
</p>

<p align="center">
  Open-source recording, transcription, and meeting analysis. Built on Azure.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2563eb?style=flat-square" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/React-19-149eca?style=flat-square&amp;logo=react&amp;logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Python-3.11%2B-3776ab?style=flat-square&amp;logo=python&amp;logoColor=white" alt="Python 3.11 or newer">
  <img src="https://img.shields.io/badge/platform-Azure-0078d4?style=flat-square" alt="Azure platform">
</p>

<p align="center">
  <a href="#product-tour">Product tour</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

---

Community Brief brings recording, transcription, reusable templates, and AI analysis into one workspace. Capture meetings, organise files, and turn unstructured conversations into reports shaped around your team's workflows.

Use it as a foundation for team meetings, project reviews, interviews, and community consultations. You host the application and connect your own identity, storage, and AI services.

## Product tour

<img src="docs/images/product-tour.png" alt="Community Brief desktop file library alongside its mobile recording interface, using fictional meeting data" width="100%">

<p align="center"><sub>Real application screens, captured locally with fictional data. Features depend on permissions and configuration.</sub></p>

### Choose a template

Choose a service area and meeting type, or jump straight to a favourite. Templates bring a consistent structure to preparation, talking points, and analysis.

<img src="docs/images/01-choose-template.png" alt="Template selection with service areas and favourite meeting types" width="100%">

### Record a meeting

Record from the browser with session controls, microphone options, and template talking points. The responsive interface supports desktop and mobile use.

<img src="docs/images/02-record-desktop.png" alt="Desktop recording screen with session controls and talking points" width="100%">

### Manage your files

Find recordings in one library, filter by date or status, and open completed jobs to review transcripts and analysis. Share files with colleagues through the application's access controls.

<img src="docs/images/04-my-files.png" alt="File library showing fictional completed meetings with search, filters, and file actions" width="100%">

<details>
<summary><strong>View the mobile recording screen</strong></summary>
<br>
<p align="center"><img src="docs/images/03-record-mobile.png" alt="Mobile recording screen with microphone controls, talking points, and a large start button" width="320"></p>
</details>

## What you can do

|     | Capability                  | What it provides                                                                                                                         |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 🎙️  | **Record and upload**       | Browser recording and media/document upload workflows.                                                                                   |
| 📝  | **Transcribe and analyse**  | Asynchronous processing with Azure AI Speech and configured AI deployments.                                                              |
| 🧩  | **Reuse templates**         | Service areas, meeting types, talking points, and configurable analysis prompts.                                                         |
| 📱  | **Work on the move**        | Responsive screens and an installable progressive web app.                                                                               |
| 📴  | **Prepare for offline use** | Account-specific cached templates, local drafts, and queued uploads. Sign in and sync online first; cloud processing needs connectivity. |
| 🤝  | **Collaborate**             | File sharing, business-unit membership, and role-based access.                                                                           |
| 📊  | **Manage the workspace**    | Analytics, template management, and administration for permitted roles.                                                                  |
| 💬  | **Import from Teams**       | Optional transcript and recording import, subject to Graph permissions and tenant policy.                                                |

## Documentation

| I want to…                                 | Read                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Configure AI models and template arguments | [Model catalogue](docs/model-catalog.md)                                                |
| Work on the frontend                       | [Frontend reference](frontend_app/README.md) · [Quickstart](frontend_app/QUICKSTART.md) |
| Work on the API                            | [Backend reference](backend_app/README.md) · [Quickstart](backend_app/QUICKSTART.md)    |
| Work on transcription and analysis         | [Worker reference](az-func-audio/README.md) · [Quickstart](az-func-audio/QUICKSTART.md) |
| Contribute or reproduce screenshots        | [Contributor guide](CONTRIBUTING.md)                                                    |

## Contributing and support

Bug reports, documentation improvements, and focused pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for development checks and guidance on useful reports.

Use [GitHub issues](https://github.com/mitchellrevil/community-brief/issues) for bugs and feature requests. Include reproduction steps and sanitised diagnostics. Review AI-generated results before using or sharing them, and configure recording consent, retention, and access for your organisation's needs.

## Acknowledgements

Community Brief builds on the original [Azure-Samples transcription accelerator](https://github.com/Azure-Samples/sonic-brief). Thank you to its authors and contributors for the application foundation and architecture documentation.

## License

Released under the [MIT License](LICENSE). Azure and other connected services require your own accounts and may incur usage charges.
