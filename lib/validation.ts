import { z } from "zod";

export const RegionEnum = z.enum(["unknown", "US", "EU", "CA", "other"]);
export const ConsentEnum = z.enum(["none", "implied", "express"]);

export const ContactInput = z.object({
  email: z.string().email(),
  name: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  region: RegionEnum.default("unknown"),
  consentStatus: ConsentEnum.default("none"),
  tags: z.string().optional().default(""),
});

export const CampaignInput = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional().nullable(),
});

export const SenderIdentityInput = z.object({
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional().nullable(),
  postalAddress: z.string().min(5),
  domain: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(true),
});

export const GithubCollectInput = z
  .object({
    repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'Use "owner/name"').optional(),
    org: z.string().min(1).optional(),
    maxUsers: z.number().int().positive().max(200).optional(),
  })
  .refine((d) => Boolean(d.repo) !== Boolean(d.org), {
    message: "Provide exactly one of repo or org",
  });

export type ContactInputType = z.infer<typeof ContactInput>;
export type CampaignInputType = z.infer<typeof CampaignInput>;
