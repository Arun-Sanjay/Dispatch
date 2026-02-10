"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProcessInput } from "@/lib/types";

const schema = z.object({
  pid: z.string().min(1, "PID is required").max(20),
  arrival_time: z.coerce.number().int().min(0),
  priority: z.coerce.number().int().min(0).max(20),
  queue: z.enum(["SYS", "USER"]),
  burst_time: z.coerce.number().int().min(1).max(999),
});

type FormData = z.infer<typeof schema>;
type FormInput = z.input<typeof schema>;

type AddProcessModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitProcess: (process: ProcessInput) => void;
};

export function AddProcessModal({ open, onOpenChange, onSubmitProcess }: AddProcessModalProps) {
  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      pid: "",
      arrival_time: 0,
      priority: 0,
      queue: "USER",
      burst_time: 3,
    },
  });

  const submit = (values: FormData) => {
    onSubmitProcess(values);
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Process</DialogTitle>
          <DialogDescription>Add a process to the live simulator session.</DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
          <div>
            <Input placeholder="PID (e.g. P6)" {...form.register("pid")} />
            {form.formState.errors.pid ? (
              <p className="mt-1 text-xs text-red-400">{form.formState.errors.pid.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input type="number" placeholder="Arrival" {...form.register("arrival_time")} />
            </div>
            <div>
              <Input type="number" placeholder="Burst" {...form.register("burst_time")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input type="number" placeholder="Priority" {...form.register("priority")} />
            </div>
            <div>
              <Select
                value={form.watch("queue")}
                onValueChange={(value) => form.setValue("queue", value as "SYS" | "USER", { shouldValidate: true })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Queue" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">USER</SelectItem>
                  <SelectItem value="SYS">SYS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
