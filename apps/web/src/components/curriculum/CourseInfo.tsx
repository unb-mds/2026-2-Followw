import { Info, X } from 'lucide-react';

import type { PublicCourse } from '#/queries/courses';

import { CourseDetails } from '#/components/curriculum/CourseDetails';
import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '#/components/ui/dialog';
import { titleCase } from '#/lib/profile';

export interface CourseInfoProps {
    course: Pick<PublicCourse, 'id' | 'name' | 'shift'>;
    entrySemester?: string | null;
}

export function CourseInfo({ course, entrySemester }: CourseInfoProps) {
    const name = titleCase(course.name);
    return (
        <Dialog>
            <DialogTrigger
                aria-label={`Informações do curso ${name}`}
                className="inline-flex max-w-full items-center gap-2 self-start rounded-sm text-left text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
                <Info className="size-5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                <span className="min-w-0 translate-y-px leading-none">{name}</span>
            </DialogTrigger>
            <DialogContent
                className="max-h-9/10 overflow-y-auto rounded-2xl sm:max-w-lg"
                showCloseButton={false}
            >
                <div className="flex items-start gap-3">
                    <DialogHeader className="min-w-0 flex-1">
                        <DialogDescription className="text-xs">
                            Informações do curso
                        </DialogDescription>
                        <DialogTitle className="text-lg leading-snug font-semibold">
                            {name}
                        </DialogTitle>
                    </DialogHeader>
                    <DialogClose
                        render={<Button variant="ghost" size="icon-lg" />}
                        aria-label="Fechar informações do curso"
                    >
                        <X className="size-5" aria-hidden="true" />
                    </DialogClose>
                </div>
                <CourseDetails course={course} entrySemester={entrySemester} />
            </DialogContent>
        </Dialog>
    );
}
