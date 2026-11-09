import { createLibrary } from '@openuidev/react-lang';
import { Card, Col } from '../intelligent-ui/components/layout';
import { Badge, Text, Title } from '../intelligent-ui/components/text';
import { SegmentedControl } from '../intelligent-ui/components/controls';

/** Reuse the production components, with only this example's six primitives. */
export const researchDemoLibrary = createLibrary({ root: 'Col', components: [Col, Card, Title, Text, Badge, SegmentedControl] });
