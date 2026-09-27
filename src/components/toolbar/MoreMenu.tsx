"use client";

import { useState } from "react";
import { useUiStore } from "@/store/ui";
import { loadExample, newDiagram } from "../actions";
import { FileIcon, KeyboardIcon, LockIcon, MoreIcon, SparkIcon } from "../icons";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Menu } from "../ui/Menu";

export function MoreMenu() {
  const openDialog = useUiStore((s) => s.openDialog);
  const [about, setAbout] = useState(false);
  return (
    <>
      <Menu
        label="More actions"
        icon={<MoreIcon />}
        iconOnly
        variant="ghost"
        title="More actions"
        items={[
          {
            id: "new",
            label: "New diagram",
            hint: "Start from a blank canvas",
            icon: <FileIcon />,
            onSelect: () => void newDiagram(),
          },
          {
            id: "example",
            label: "Load example",
            hint: "A small shop with a few problems to fix",
            icon: <SparkIcon />,
            onSelect: () => void loadExample(),
          },
          {
            id: "shortcuts",
            label: "Keyboard shortcuts",
            icon: <KeyboardIcon />,
            separatorBefore: true,
            onSelect: () => openDialog("shortcuts"),
          },
          {
            id: "about",
            label: "About & privacy",
            hint: "Your diagrams never leave this browser",
            icon: <LockIcon />,
            onSelect: () => setAbout(true),
          },
        ]}
      />
      {about && (
        <Dialog
          title="About ERD Studio"
          size="narrow"
          onClose={() => setAbout(false)}
          footer={
            <Button variant="primary" onClick={() => setAbout(false)}>
              Close
            </Button>
          }
        >
          <p style={{ marginTop: 0 }}>
            Sketch database tables, mark primary and foreign keys, link them with crow’s-foot
            relationships and check your design against the normal forms.
          </p>
          <p>
            <strong>Your diagrams never leave this browser.</strong> Everything is saved in this
            browser’s local storage and all exports are made on your device. Share links carry the
            whole diagram inside the link itself — nothing is uploaded.
          </p>
          <p>
            <strong>Visit and speed statistics.</strong> This site uses Vercel Web Analytics to
            count page visits and Vercel Speed Insights to measure how quickly pages load. They
            record the page address with anything after <code>?</code> or <code>#</code> removed,
            the site you came from, your browser, operating system and device type, your approximate
            country, and page-load timings. They use no cookies, keep no IP addresses and never
            include your diagrams or share links.
          </p>
          <p style={{ marginBottom: 0, color: "var(--ink-soft)", fontSize: 13 }}>
            Clearing your browser data removes the saved diagram, so export a diagram file (.json)
            to keep a copy.
          </p>
        </Dialog>
      )}
    </>
  );
}
