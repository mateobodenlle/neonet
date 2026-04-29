# data/

Drop user-data exports here for the importers. Everything in this directory
except `.gitkeep` and this README is gitignored — files never end up on GitHub.

Expected layout:

```
data/
├── contacts.vcf                    # Galaxy export (vCard 3.0)
└── linkedin/
    └── Connections.csv             # LinkedIn data export
```

Run:

```bash
npm run import:vcard      data/contacts.vcf                     # dry run
npm run import:vcard --   data/contacts.vcf --commit            # actually insert

npm run import:linkedin   data/linkedin/Connections.csv         # dry run
npm run import:linkedin -- data/linkedin/Connections.csv --commit
```
