# Metal - Documentation

This directory will contain the documentation site (Docusaurus/Nextra).

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm docs:dev

# Build for production
pnpm docs:build
```

## Structure

- `/docs` - Markdown documentation files
- `/src` - Custom components and pages
- `/static` - Static assets
- `docusaurus.config.ts` - Docusaurus configuration
- `sidebars.ts` - Sidebar navigation structure

## Documentation Pages

- Getting Started
- Schema Definition
- Querying Data
- Relationships & Traversals
- Migrations
- Seeding
- GraphQL Integration
- Multi-Database Support
- Observability
- Authentication
- Testing
- Deployment
- API Reference

## Configuration

The documentation site uses Docusaurus with:
- TypeScript support
- Mermaid diagrams for ERD
- Code playgrounds
- Versioned docs
- Search (Algolia)
- Dark mode